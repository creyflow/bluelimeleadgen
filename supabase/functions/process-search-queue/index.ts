import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchJob {
  id: string;
  batch_id: string;
  query: string;
  location: string | null;
  pages: number;
  target_names: string[] | null;
  country: string | null; // 🌍 NEW: Country code (it, de, uk, etc.)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting queue processor...');

    // 1. Trova batch in stato 'running'
    const { data: runningBatches, error: batchError } = await supabase
      .from('search_batches')
      .select('*')
      .eq('status', 'running')
      .order('created_at', { ascending: true });

    if (batchError) {
      console.error('Error fetching batches:', batchError);
      throw batchError;
    }

    if (!runningBatches || runningBatches.length === 0) {
      console.log('No running batches found');
      return new Response(
        JSON.stringify({ message: 'No running batches' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let jobsProcessedCount = 0;
    const PARALLEL_JOBS = 2; // Process 2 jobs at a time

    for (const batch of runningBatches) {
      console.log(`Processing batch: ${batch.id} - ${batch.name}`);

      // 2. Trova i prossimi N job pending
      const { data: jobs, error: jobsError } = await supabase
        .from('search_jobs')
        .select('*')
        .eq('batch_id', batch.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(PARALLEL_JOBS);

      if (jobsError) {
        console.error('Error fetching jobs:', jobsError);
        continue;
      }

      if (!jobs || jobs.length === 0) {
        // Nessun job pending, controlla se ce ne sono altri in running
        const { count } = await supabase
          .from('search_jobs')
          .select('*', { count: 'exact', head: true })
          .eq('batch_id', batch.id)
          .eq('status', 'running');

        // Se non ci sono nemmeno job in running, allora il batch è davvero finito
        if (count === 0) {
          console.log(`Batch ${batch.id} completed`);
          await supabase
            .from('search_batches')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString()
            })
            .eq('id', batch.id);
        }
        continue;
      }

      console.log(`Found ${jobs.length} pending jobs to process in parallel`);

      // 3. Elabora i job in parallelo
      const jobPromises = jobs.map(async (job: SearchJob) => {
        try {
          // Marca il job come running
          await supabase
            .from('search_jobs')
            .update({ status: 'running' })
            .eq('id', job.id);

          // Use batch name for the validation list
          const batchName = batch.name;

          // Ottieni user_id del job
          const { data: jobData } = await supabase
            .from('search_jobs')
            .select('user_id')
            .eq('id', job.id)
            .single();

          // Costruisci il body della richiesta
          const requestBody = {
            query: job.query,
            pages: job.pages,
            location: job.location,
            user_id: jobData?.user_id,
            targetNames: job.target_names || [],
            country: job.country || 'it',
            batch_name: batchName,
          };

          console.log(`[Job ${job.id}] Invoking search-contacts...`);

          const searchUrl = `${supabaseUrl}/functions/v1/search-contacts`;
          const searchResponse = await fetch(searchUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            throw new Error(`Search failed: ${searchResponse.status} - ${errorText}`);
          }

          const searchData = await searchResponse.json();
          console.log(`[Job ${job.id}] Completed: ${searchData.contacts?.length || 0} contacts`);

          // Ottieni l'ID della ricerca
          const { data: latestSearch } = await supabase
            .from('searches')
            .select('id')
            .eq('user_id', jobData?.user_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          // Aggiorna il job come completato
          await supabase
            .from('search_jobs')
            .update({
              status: 'completed',
              executed_at: new Date().toISOString(),
              result_count: searchData.contacts?.length || 0,
              search_id: latestSearch?.id,
            })
            .eq('id', job.id);

          // Incrementa counter batch (atomico sarebbe meglio, ma per ora va bene così)
          const { error: rpcError } = await supabase.rpc('increment_batch_counter', {
            batch_uuid: batch.id,
            field: 'completed_jobs'
          });

          if (rpcError) {
            // Fallback se RPC non esiste (ma dovresti crearla per concorrenza sicura)
            const { data: currentBatch } = await supabase.from('search_batches').select('completed_jobs').eq('id', batch.id).single();
            if (currentBatch) {
              await supabase.from('search_batches').update({ completed_jobs: currentBatch.completed_jobs + 1 }).eq('id', batch.id);
            }
          }

        } catch (error) {
          console.error(`[Job ${job.id}] Failed:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          await supabase
            .from('search_jobs')
            .update({
              status: 'failed',
              executed_at: new Date().toISOString(),
              error_message: errorMessage,
            })
            .eq('id', job.id);

          // Incrementa errori
          const { error: rpcError } = await supabase.rpc('increment_batch_counter', {
            batch_uuid: batch.id,
            field: 'failed_jobs'
          });

          if (rpcError) {
            const { data: currentBatch } = await supabase.from('search_batches').select('failed_jobs').eq('id', batch.id).single();
            if (currentBatch) {
              await supabase.from('search_batches').update({ failed_jobs: currentBatch.failed_jobs + 1 }).eq('id', batch.id);
            }
          }
        }
      });

      // Attendi che tutti i job paralleli finiscano
      await Promise.all(jobPromises);
      jobsProcessedCount += jobs.length;
    }

    // 4. LOGICA RICORSIVA: Se abbiamo processato dei job, probabilmente ce ne sono altri.
    // Rinvoca la funzione stessa per continuare il lavoro subito.
    if (jobsProcessedCount > 0) {
      console.log(`Processed ${jobsProcessedCount} jobs. Triggering next batch recursively...`);

      // Invoca asincronamente se stessa (fire & forget)
      fetch(`${supabaseUrl}/functions/v1/process-search-queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({}),
      }).catch(err => console.error("Error triggering recursive call:", err));
    } else {
      console.log("No jobs processed in this cycle. Queue empty or all batches completed.");
    }

    return new Response(
      JSON.stringify({ message: `Processed ${jobsProcessedCount} jobs` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing queue:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
