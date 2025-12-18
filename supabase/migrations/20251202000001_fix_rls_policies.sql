
-- Enable RLS on tables
ALTER TABLE public.validation_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_results ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure clean slate
DROP POLICY IF EXISTS "Users can view own lists" ON public.validation_lists;
DROP POLICY IF EXISTS "Users can insert own lists" ON public.validation_lists;
DROP POLICY IF EXISTS "Users can update own lists" ON public.validation_lists;
DROP POLICY IF EXISTS "Users can delete own lists" ON public.validation_lists;

DROP POLICY IF EXISTS "Users can view own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can insert own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can delete own contacts" ON public.contacts;

DROP POLICY IF EXISTS "Users can view own results" ON public.validation_results;
DROP POLICY IF EXISTS "Users can delete own results" ON public.validation_results;

-- Create comprehensive policies for validation_lists
CREATE POLICY "Users can view own lists" ON public.validation_lists 
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lists" ON public.validation_lists 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lists" ON public.validation_lists 
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own lists" ON public.validation_lists 
    FOR DELETE USING (auth.uid() = user_id);

-- Create comprehensive policies for contacts
-- Note: contacts are linked to lists, so we check if the user owns the list
CREATE POLICY "Users can view own contacts" ON public.contacts 
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.validation_lists l 
            WHERE l.id = contacts.list_id 
            AND l.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own contacts" ON public.contacts 
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.validation_lists l 
            WHERE l.id = contacts.list_id 
            AND l.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own contacts" ON public.contacts 
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.validation_lists l 
            WHERE l.id = contacts.list_id 
            AND l.user_id = auth.uid()
        )
    );

-- Create comprehensive policies for validation_results
CREATE POLICY "Users can view own results" ON public.validation_results 
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.validation_lists l 
            WHERE l.id = validation_results.validation_list_id 
            AND l.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own results" ON public.validation_results 
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.validation_lists l 
            WHERE l.id = validation_results.validation_list_id 
            AND l.user_id = auth.uid()
        )
    );
