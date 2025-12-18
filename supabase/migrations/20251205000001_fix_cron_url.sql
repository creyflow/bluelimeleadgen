-- Fix pg_cron scheduler with correct Supabase project URL
-- Drop old cron job with wrong URL
SELECT cron.unschedule('process-search-queue-job');

-- Create new cron job with correct URL (vpselawcoxswncpixrno)
SELECT cron.schedule(
  'process-search-queue-job',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
        url:='https://vpselawcoxswncpixrno.supabase.co/functions/v1/process-search-queue',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwc2VsYXdjb3hzd25jcGl4cm5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MDQ1MzQsImV4cCI6MjA4MDE4MDUzNH0.35YLqyuiIGvHI040EKLAwYrlUtyNaHFx-hRlQig1Qwg"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Verify the cron job is active
SELECT * FROM cron.job WHERE jobname = 'process-search-queue-job';
