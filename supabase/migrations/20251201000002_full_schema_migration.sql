
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. CORE TABLES (Original Schema)
-- ==========================================

-- SEARCHES
CREATE TABLE IF NOT EXISTS public.searches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    query TEXT NOT NULL,
    location TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- VALIDATION LISTS
CREATE TABLE IF NOT EXISTS public.validation_lists (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    status TEXT DEFAULT 'created',
    total_emails INTEGER DEFAULT 0,
    processed_emails INTEGER DEFAULT 0,
    deliverable_count INTEGER DEFAULT 0,
    undeliverable_count INTEGER DEFAULT 0,
    risky_count INTEGER DEFAULT 0,
    unknown_count INTEGER DEFAULT 0,
    truelist_batch_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- CONTACTS
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    search_id UUID REFERENCES public.searches(id),
    list_id UUID REFERENCES public.validation_lists(id),
    email TEXT,
    name TEXT,
    organization TEXT,
    phone TEXT,
    website TEXT,
    social_links JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- SEARCH BATCHES
CREATE TABLE IF NOT EXISTS public.search_batches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    total_jobs INTEGER DEFAULT 0,
    completed_jobs INTEGER DEFAULT 0,
    failed_jobs INTEGER DEFAULT 0,
    delay_seconds INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- SEARCH JOBS
CREATE TABLE IF NOT EXISTS public.search_jobs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES public.search_batches(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    search_id UUID REFERENCES public.searches(id),
    query TEXT NOT NULL,
    location TEXT,
    country TEXT,
    target_names TEXT[],
    pages INTEGER DEFAULT 1,
    status TEXT DEFAULT 'pending',
    result_count INTEGER,
    error_message TEXT,
    executed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- QUERY TEMPLATES
CREATE TABLE IF NOT EXISTS public.query_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id), -- Nullable for system templates
    name TEXT NOT NULL,
    description TEXT,
    query_pattern TEXT NOT NULL,
    default_pages INTEGER DEFAULT 1,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- VALIDATION QUEUE
CREATE TABLE IF NOT EXISTS public.validation_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    validation_list_id UUID NOT NULL REFERENCES public.validation_lists(id),
    email TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- VALIDATION RESULTS
CREATE TABLE IF NOT EXISTS public.validation_results (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    validation_list_id UUID NOT NULL REFERENCES public.validation_lists(id),
    email TEXT NOT NULL,
    result TEXT,
    reason TEXT,
    deliverable BOOLEAN,
    undeliverable BOOLEAN, -- Added for compatibility if needed, though usually inferred
    risky BOOLEAN, -- Added for compatibility
    unknown BOOLEAN, -- Added for compatibility
    disposable BOOLEAN,
    free_email BOOLEAN,
    domain_valid BOOLEAN,
    smtp_valid BOOLEAN,
    format_valid BOOLEAN,
    catch_all BOOLEAN,
    full_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ==========================================
-- 2. NEW TABLES (Plans & Usage)
-- ==========================================

-- PLANS
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price NUMERIC,
  monthly_email_limit BIGINT, -- -1 for unlimited
  monthly_search_limit INTEGER DEFAULT 100, -- -1 for unlimited
  max_lists INTEGER,
  max_emails_per_list INTEGER,
  validation_limit BIGINT, -- -1 for unlimited
  speed_limit INTEGER, -- emails per second
  features JSONB
);

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  plan_id TEXT REFERENCES public.plans(id) DEFAULT 'free',
  subscription_status TEXT DEFAULT 'active',
  current_period_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
  current_period_end TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '1 month'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- USAGE RECORDS
CREATE TABLE IF NOT EXISTS public.usage_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  emails_found_count BIGINT DEFAULT 0,
  validations_performed_count BIGINT DEFAULT 0,
  searches_performed_count INTEGER DEFAULT 0,
  lists_created_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, period_start)
);

-- ==========================================
-- 3. SECURITY (RLS)
-- ==========================================

ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own searches" ON public.searches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own searches" ON public.searches FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own lists" ON public.validation_lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own lists" ON public.validation_lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own lists" ON public.validation_lists FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own contacts" ON public.contacts FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.searches s WHERE s.id = contacts.search_id AND s.user_id = auth.uid())
    OR 
    EXISTS (SELECT 1 FROM public.validation_lists l WHERE l.id = contacts.list_id AND l.user_id = auth.uid())
);
CREATE POLICY "Users can insert own contacts" ON public.contacts FOR INSERT WITH CHECK (true); -- Simplified for batch inserts

CREATE POLICY "Users can view own batches" ON public.search_batches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own batches" ON public.search_batches FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own jobs" ON public.search_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own jobs" ON public.search_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own templates" ON public.query_templates FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can insert own templates" ON public.query_templates FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view plans" ON public.plans FOR SELECT USING (true);

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own usage" ON public.usage_records FOR SELECT USING (auth.uid() = user_id);

-- ==========================================
-- 4. FUNCTIONS & TRIGGERS
-- ==========================================

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, plan_id)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'free');
  
  INSERT INTO public.usage_records (user_id, period_start, period_end)
  VALUES (new.id, now(), now() + interval '1 month');
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to check limits
CREATE OR REPLACE FUNCTION public.check_usage_limit(
  p_user_id UUID, 
  p_metric TEXT, 
  p_amount INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan_id TEXT;
  v_limit BIGINT;
  v_current_usage BIGINT;
  v_period_start TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get user plan
  SELECT plan_id INTO v_plan_id FROM public.profiles WHERE id = p_user_id;
  
  -- Get current period start
  SELECT current_period_start INTO v_period_start FROM public.profiles WHERE id = p_user_id;
  
  -- Get limit based on metric
  IF p_metric = 'emails_found' THEN
    SELECT monthly_email_limit INTO v_limit FROM public.plans WHERE id = v_plan_id;
    SELECT emails_found_count INTO v_current_usage FROM public.usage_records 
    WHERE user_id = p_user_id AND period_start = v_period_start;
  ELSIF p_metric = 'validations' THEN
    SELECT validation_limit INTO v_limit FROM public.plans WHERE id = v_plan_id;
    SELECT validations_performed_count INTO v_current_usage FROM public.usage_records 
    WHERE user_id = p_user_id AND period_start = v_period_start;
  ELSIF p_metric = 'searches' THEN
    SELECT monthly_search_limit INTO v_limit FROM public.plans WHERE id = v_plan_id;
    SELECT searches_performed_count INTO v_current_usage FROM public.usage_records 
    WHERE user_id = p_user_id AND period_start = v_period_start;
  END IF;
  
  -- Check if unlimited (-1) or within limit
  IF v_limit = -1 THEN
    RETURN TRUE;
  END IF;
  
  IF (v_current_usage + p_amount) > v_limit THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment usage
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id UUID, 
  p_metric TEXT, 
  p_amount INTEGER
)
RETURNS VOID AS $$
DECLARE
  v_period_start TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get current period start
  SELECT current_period_start INTO v_period_start FROM public.profiles WHERE id = p_user_id;
  
  -- Update usage
  IF p_metric = 'emails_found' THEN
    UPDATE public.usage_records 
    SET emails_found_count = emails_found_count + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id AND period_start = v_period_start;
  ELSIF p_metric = 'validations' THEN
    UPDATE public.usage_records 
    SET validations_performed_count = validations_performed_count + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id AND period_start = v_period_start;
  ELSIF p_metric = 'searches' THEN
    UPDATE public.usage_records 
    SET searches_performed_count = searches_performed_count + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id AND period_start = v_period_start;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment validation counter (from original schema)
CREATE OR REPLACE FUNCTION public.increment_validation_counter(
    counter_name TEXT, 
    list_id UUID
)
RETURNS VOID AS $$
BEGIN
    IF counter_name = 'processed' THEN
        UPDATE public.validation_lists SET processed_emails = processed_emails + 1 WHERE id = list_id;
    ELSIF counter_name = 'deliverable' THEN
        UPDATE public.validation_lists SET deliverable_count = deliverable_count + 1 WHERE id = list_id;
    ELSIF counter_name = 'undeliverable' THEN
        UPDATE public.validation_lists SET undeliverable_count = undeliverable_count + 1 WHERE id = list_id;
    ELSIF counter_name = 'risky' THEN
        UPDATE public.validation_lists SET risky_count = risky_count + 1 WHERE id = list_id;
    ELSIF counter_name = 'unknown' THEN
        UPDATE public.validation_lists SET unknown_count = unknown_count + 1 WHERE id = list_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 5. SEED DATA (Plans)
-- ==========================================

INSERT INTO public.plans (id, name, monthly_price, monthly_email_limit, monthly_search_limit, max_lists, max_emails_per_list, validation_limit, speed_limit, features)
VALUES
  ('free', 'Free', 0, 5000, 100, 10, 1000, 5000, 10, '["Validazione base", "Export CSV/XLSX"]'),
  ('basic', 'Basic', 9.9, 10000, 250, 20, 2500, 10000, 10, '["Validazione avanzata", "Export CSV/XLSX/JSON", "Supporto prioritario"]'),
  ('pro', 'Pro', 19.9, 25000, 500, 50, 5000, 25000, 10, '["Validazione avanzata", "Tutti i formati export", "Accesso API", "Supporto prioritario"]'),
  ('elite', 'Elite', 29.9, 100000, 1000, 100, 25000, 100000, 10, '["Validazione avanzata", "Tutti i formati export", "Accesso API", "Supporto dedicato", "Integrazione custom"]'),
  ('vip', 'VIP', 49.9, 500000, 50000, 250, 100000, 500000, 10, '["Validazione avanzata", "Tutti i formati export", "Accesso API completo", "Supporto dedicato", "Integrazione custom"]'),
  ('unlimited', 'Unlimited', 99.9, -1, -1, 500, 500000, -1, 20, '["Tutto illimitato", "Validazione avanzata", "Tutti i formati export", "Accesso API completo", "Supporto dedicato", "Integrazione custom"]')
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name,
    monthly_price = EXCLUDED.monthly_price,
    monthly_email_limit = EXCLUDED.monthly_email_limit,
    monthly_search_limit = EXCLUDED.monthly_search_limit,
    validation_limit = EXCLUDED.validation_limit,
    features = EXCLUDED.features;

-- ==========================================
-- 6. CRON JOB SCHEDULER
-- ==========================================

-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create a cron job that runs every minute to process the search queue
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

