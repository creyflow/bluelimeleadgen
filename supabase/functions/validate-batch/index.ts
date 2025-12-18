import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationRequest {
  emails: string[];
  listName: string;
  existingListId?: string;
}

interface TruelistBatchResponse {
  id: string;
  batch_state: string;
  email_count: number;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? 'https://vpselawcoxswncpixrno.supabase.co',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Admin Client EARLY so it's available for limit checks
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? 'https://vpselawcoxswncpixrno.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body
    const { emails, listName, existingListId }: ValidationRequest = await req.json();
    
    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No emails provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`User ${user.id} validating ${emails.length} emails`);

    // Check usage limits
    const { data: allowed, error: limitError } = await supabaseClient.rpc('check_usage_limit', {
      p_user_id: user.id,
      p_metric: 'validations',
      p_amount: emails.length
    });

    if (limitError) {
      console.error('Error checking limits:', limitError);
    } else if (allowed === false) {
      return new Response(
        JSON.stringify({ error: 'Monthly validation limit reached. Please upgrade your plan.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check max emails per list limit
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();
      
    if (profile) {
      const { data: plan } = await supabaseAdmin
        .from('plans')
        .select('max_emails_per_list')
        .eq('id', profile.plan_id)
        .single();
        
      if (plan && emails.length > plan.max_emails_per_list) {
        return new Response(
          JSON.stringify({ 
            error: `List size exceeds plan limit. Your plan allows max ${plan.max_emails_per_list} emails per list.` 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get Truelist API key
    const truelistApiKey = Deno.env.get('TRUELIST_API_KEY');
    if (!truelistApiKey) {
      throw new Error('TRUELIST_API_KEY not configured');
    }

    let validationListId: string;

    if (existingListId) {
      // Update existing list
      const { error: updateError } = await supabaseAdmin
        .from('validation_lists')
        .update({
          status: 'processing',
          total_emails: emails.length,
          processed_emails: 0,
          deliverable_count: 0,
          undeliverable_count: 0,
          risky_count: 0,
          unknown_count: 0,
        })
        .eq('id', existingListId);

      if (updateError) {
        console.error('Error updating validation list:', updateError);
        throw new Error('Failed to update validation list');
      }
      
      validationListId = existingListId;
      console.log(`Updated existing validation list: ${validationListId}`);
    } else {
      // Check max lists limit
      if (profile) {
        const { data: plan } = await supabaseAdmin
          .from('plans')
          .select('max_lists')
          .eq('id', profile.plan_id)
          .single();
          
        if (plan) {
          const { count } = await supabaseAdmin
            .from('validation_lists')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);
            
          if (count !== null && count >= plan.max_lists) {
            return new Response(
              JSON.stringify({ 
                error: `You have reached the maximum number of lists (${plan.max_lists}) for your plan.` 
              }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }

      // Create new list
      const { data: validationList, error: listError } = await supabaseAdmin
        .from('validation_lists')
        .insert({
          name: listName || `Validation ${new Date().toISOString()}`,
          user_id: user.id,
          total_emails: emails.length,
          status: 'processing',
          processed_emails: 0,
          deliverable_count: 0,
          undeliverable_count: 0,
          risky_count: 0,
          unknown_count: 0,
        })
        .select()
        .single();

      if (listError) {
        console.error('Error creating validation list:', listError);
        throw new Error('Failed to create validation list');
      }
      
      validationListId = validationList.id;
      console.log(`Created new validation list: ${validationListId}`);
    }

    // Prepare data for Truelist Batch API
    // Format: [['email1@example.com'], ['email2@example.com'], ...]
    // Add a unique marker email to ensure payload uniqueness (Truelist checks content hash)
    const uniqueMarker = `batch_${Date.now()}_${crypto.randomUUID().slice(0,8)}@marker.internal`;
    const emailData = [
      [uniqueMarker], // This will be marked invalid by Truelist but makes payload unique
      ...emails.map(email => [email.trim().toLowerCase()])
    ];
    
    // Create batch on Truelist
    const formData = new FormData();
    formData.append('data', JSON.stringify(emailData));
    // Add UUID + timestamp to filename to avoid "Duplicate file upload" error from Truelist
    const randomId = crypto.randomUUID().slice(0, 8);
    const uniqueFilename = `batch_${randomId}_${Date.now()}.json`;
    formData.append('filename', uniqueFilename);

    // Add webhook URL for Truelist to call when validation is complete
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'https://vpselawcoxswncpixrno.supabase.co';
    const webhookUrl = `${supabaseUrl}/functions/v1/process-validation-batch?list_id=${validationListId}`;
    formData.append('webhook_url', webhookUrl);
    console.log(`Setting webhook URL: ${webhookUrl}`);

    console.log(`Creating Truelist batch for ${emails.length} emails with filename: ${uniqueFilename}`);

    const truelistResponse = await fetch('https://api.truelist.io/api/v1/batches', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${truelistApiKey}`,
      },
      body: formData,
    });

    if (!truelistResponse.ok) {
      const errorText = await truelistResponse.text();
      console.error('Truelist API error:', truelistResponse.status, errorText);
      
      // Update list status to failed
      await supabaseAdmin
        .from('validation_lists')
        .update({ status: 'failed' })
        .eq('id', validationListId);
        
      throw new Error(`Truelist API error: ${truelistResponse.status} - ${errorText}`);
    }

    const batchData: TruelistBatchResponse = await truelistResponse.json();
    console.log(`Truelist batch created: ${batchData.id}, state: ${batchData.batch_state}`);

    // Save Truelist batch ID in database
    await supabaseAdmin
      .from('validation_lists')
      .update({ 
        truelist_batch_id: batchData.id,
      })
      .eq('id', validationListId);

    // Increment usage stats
    const { error: usageError } = await supabaseAdmin.rpc('increment_usage', {
      p_user_id: user.id,
      p_metric: 'validations',
      p_amount: emails.length
    });
    
    if (usageError) {
      console.error('Error incrementing usage:', usageError);
    } else {
      console.log(`Incremented validation usage for user ${user.id} by ${emails.length}`);
    }

    // Return success with list_id for polling
    return new Response(
      JSON.stringify({
        success: true,
        list_id: validationListId,
        truelist_batch_id: batchData.id,
        total_emails: emails.length,
        message: `Batch created successfully. Use list_id to check status.`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in validate-batch:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
