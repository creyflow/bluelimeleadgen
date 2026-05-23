import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TruelistBatchResult {
  id: string;
  batch_state: string;
  email_count: number;
  processed_count: number;
  ok_count: number;
  unknown_count: number;
  disposable_count: number;
  role_count: number;
  failed_syntax_check_count: number;
  failed_mx_check_count: number;
  failed_no_mailbox_count: number;
  ok_for_all_count: number;
  safest_bet_csv_url?: string;
  highest_reach_csv_url?: string;
  annotated_csv_url?: string;
}

// This function handles:
// 1. Webhook from Mails.so (if supported)
// 2. Manual polling to check batch status and fetch results
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const mailsApiKey = Deno.env.get('MAILS_SO_API_KEY') || '226ab8a5-7789-43f3-8e92-ce5390980993';
    if (!mailsApiKey) {
      throw new Error('MAILS_SO_API_KEY not configured');
    }

    const url = new URL(req.url);
    const listId = url.searchParams.get('list_id');
    
    let batchId: string | null = null;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        batchId = body.batch_id || body.id;
        console.log('Received webhook/ping, batch_id:', batchId);
      } catch {
        console.log('No JSON body, checking for manual trigger');
      }
    }

    // If no batch_id from webhook, get it from our database using list_id
    if (!batchId && listId) {
      const { data: list } = await supabase
        .from('validation_lists')
        .select('truelist_batch_id')
        .eq('id', listId)
        .single();
      
      batchId = list?.truelist_batch_id;
    }

    // If still no batch_id, check for processing lists
    if (!batchId) {
      const { data: processingLists } = await supabase
        .from('validation_lists')
        .select('id, truelist_batch_id')
        .eq('status', 'processing')
        .not('truelist_batch_id', 'is', null)
        .limit(5);

      if (processingLists && processingLists.length > 0) {
        console.log(`Found ${processingLists.length} processing lists to check`);
        
        for (const list of processingLists) {
          await processCompletedBatch(supabase, mailsApiKey, list.truelist_batch_id, list.id);
        }
        
        return new Response(
          JSON.stringify({ success: true, checked: processingLists.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
      
      return new Response(
        JSON.stringify({ message: 'No batches to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Get the list for this batch
    const { data: validationList } = await supabase
      .from('validation_lists')
      .select('*')
      .eq('truelist_batch_id', batchId)
      .single();

    if (!validationList) {
      console.error('No validation list found for batch:', batchId);
      return new Response(
        JSON.stringify({ error: 'Validation list not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    await processCompletedBatch(supabase, mailsApiKey, batchId, validationList.id);

    return new Response(
      JSON.stringify({ success: true, list_id: validationList.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in process-validation-batch:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function processCompletedBatch(
  supabase: any,
  mailsApiKey: string,
  batchId: string,
  listId: string
) {
  console.log(`Processing Mails.so batch ${batchId} for list ${listId}`);

  // Fetch from Mails.so
  const batchResponse = await fetch(`https://api.mails.so/v1/batch/${batchId}`, {
    method: 'GET',
    headers: {
      'x-mails-api-key': mailsApiKey,
    },
  });

  if (!batchResponse.ok) {
    console.error('Failed to get batch status from Mails.so:', batchResponse.status);
    return;
  }

  const batchData = await batchResponse.json();

  if (!batchData.finished_at) {
    console.log('Batch not yet completed. Null finished_at property.');
    return;
  }

  console.log('Mails.so batch completed! Processing results...');

  const emailsArray = batchData.emails || [];
  if (emailsArray.length === 0) {
    console.log('No emails found in Mails.so response.');
    return;
  }

  const validationResults: any[] = [];
  let delivCount = 0;
  let undelivCount = 0;
  let riskyCount = 0;
  let unkCount = 0;

  for (const item of emailsArray) {
    const email = item.email;
    if (!email) continue;
    
    // Mails.so result can be: deliverable, undeliverable, risky, unknown
    // Just lowercasing safety check
    const result = (item.result || 'unknown').toLowerCase();
    
    if (result === 'deliverable') delivCount++;
    else if (result === 'undeliverable') undelivCount++;
    else if (result === 'risky') riskyCount++;
    else unkCount++;

    validationResults.push({
      validation_list_id: listId,
      email: email,
      result: result,
      reason: item.reason || '',
      format_valid: item.isv_format === true,
      domain_valid: item.isv_domain === true,
      smtp_valid: item.isv_mx === true,
      deliverable: result === 'deliverable',
      catch_all: item.isv_nocatchall === false,
      disposable: item.isv_noblock === false,
      free_email: item.is_free === true,
      full_response: item,
    });
  }

  console.log(`Parsed ${validationResults.length} results from Mails.so JSON`);

  // Update counts
  await supabase
    .from('validation_lists')
    .update({
      processed_emails: emailsArray.length,
      deliverable_count: delivCount,
      risky_count: riskyCount,
      undeliverable_count: undelivCount,
      unknown_count: unkCount,
      status: 'completed',
    })
    .eq('id', listId);

  // Insert results in batches of 100
  const batchSize = 100;
  for (let i = 0; i < validationResults.length; i += batchSize) {
    const batch = validationResults.slice(i, i + batchSize);
    const { error: insertError } = await supabase
      .from('validation_results')
      .insert(batch);

    if (insertError) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, insertError);
    } else {
      console.log(`Inserted batch ${i / batchSize + 1} (${batch.length} results)`);
    }
  }

  console.log(`Finished processing Mails.so batch ${batchId}`);
}
