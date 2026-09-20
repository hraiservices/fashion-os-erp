-- Forensic Supabase audit (2026-09-19/20): user_mini_sheets, user_scratch_notes, and user_todos
-- all have RLS enabled with ZERO policies -- Postgres denies all access by default in that state,
-- so these are fully locked (not open): nobody, including each table's own owner, can currently
-- read or write their own rows through the API. This is a functionality bug, not a security hole
-- -- whatever personal scratch-notes/todo/mini-sheet feature these back has been completely
-- broken for every user.
--
-- Each table has a `user_email text` column identifying its owner (confirmed via
-- information_schema.columns) but no auth.uid()-linked user id column, so ownership is scoped by
-- matching the caller's JWT email, same pattern as chatbot_messages_select_scoped and
-- push_subscriptions' own_subscriptions_* policies elsewhere in this schema.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['user_mini_sheets', 'user_scratch_notes', 'user_todos'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_owner_all', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (lower(user_email) = lower(coalesce(auth.jwt() ->> ''email'', '''')))
         WITH CHECK (lower(user_email) = lower(coalesce(auth.jwt() ->> ''email'', '''')))',
      tbl || '_owner_all', tbl
    );
  END LOOP;
END $$;
