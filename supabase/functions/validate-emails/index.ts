import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationRequest {
  emails: string[];
  listName: string;
}

interface TruelistBatchResponse {
  id: string;
  batch_state: string;
  email_count: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`User authenticated: ${user.id}`);

    const { emails, listName }: ValidationRequest = await req.json();
    console.log(`Starting batch validation for ${emails.length} emails`);

    const mailsApiKey = Deno.env.get('MAILS_SO_API_KEY') || '226ab8a5-7789-43f3-8e92-ce5390980993'; // Fallback to provided key
    if (!mailsApiKey) {
      throw new Error('MAILS_SO_API_KEY not configured');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create validation list in our database
    const { data: validationList, error: listError } = await supabaseClient
      .from('validation_lists')
      .insert({
        name: listName,
        user_id: user.id,
        total_emails: emails.length,
        status: 'processing'
      })
      .select()
      .single();

    if (listError) throw listError;

    console.log('Created validation list:', validationList.id);

    // Prepare data for Mails.so Batch API
    const cleanEmails = emails.map(email => email.trim().toLowerCase());
    
    console.log('Creating Mails.so batch...');

    const mailsResponse = await fetch('https://api.mails.so/v1/batch', {
      method: 'POST',
      headers: {
        'x-mails-api-key': mailsApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ emails: cleanEmails }),
    });

    if (!mailsResponse.ok) {
      const errorText = await mailsResponse.text();
      console.error('Mails.so batch creation failed:', mailsResponse.status, errorText);
      
      // Update list status to failed
      await supabaseAdmin
        .from('validation_lists')
        .update({ status: 'failed' })
        .eq('id', validationList.id);
        
      throw new Error(`Mails.so API error: ${mailsResponse.status} - ${errorText}`);
    }

    const batchData = await mailsResponse.json();
    console.log('Mails.so batch created:', batchData.id);

    // Store Mails.so batch ID for tracking
    const { error: updateError } = await supabaseAdmin
      .from('validation_lists')
      .update({ 
        truelist_batch_id: batchData.id, // Keeping column name for backwards compatibility with DB schema
        status: 'processing'
      })
      .eq('id', validationList.id);

    if (updateError) {
      console.error('Error updating list with batch ID:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        list_id: validationList.id,
        truelist_batch_id: batchData.id,
        message: `Batch created for ${emails.length} emails. Mails.so will process in background.`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error in validate-emails function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
