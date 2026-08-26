-- CRITICAL, confirmed-live privilege escalation. `user_roles` has never had a migration of its
-- own (it predates this migrations folder) and its RLS has always been permissive
-- (`USING (true) WITH CHECK (true)`, same default as every other table here). Every API route
-- under /api/user-roles/* already gates writes on `manageUsers` — but that only closes the path
-- the APP's own UI uses. Because RLS is unrestricted for the `authenticated` role, any logged-in
-- user (including a tailor whose default permissions are all false) can bypass every one of
-- those routes entirely and, from the browser console with the exact same session the app
-- already holds, run:
--   supabase.from('user_roles').upsert({ email: 'me@shop.com', role: 'admin' })
-- getServerUser() resolves every permission check in the entire app from this one table, so
-- this is a complete, one-line privilege escalation to admin, requiring nothing more than a
-- valid login.
--
-- Fix: block INSERT/UPDATE/DELETE on user_roles for `authenticated` entirely, except for the
-- one legitimate self-service path this app relies on — ensureUserRole() in
-- src/lib/supabase/role-bootstrap.ts, called from the login/signup page with the plain browser
-- client, which inserts a NEW row for the CALLER'S OWN email, defaulting to role 'tailor'
-- unless the table is completely empty (first-ever user becomes admin). That path is preserved
-- exactly by the WITH CHECK below; every other write must now go through the service-role
-- client (see the four /api/user-roles/* routes, updated alongside this migration to use
-- createServiceClient() for the actual mutation, after their existing manageUsers check).
-- SELECT is left untouched — every request still needs to read its own row.

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON user_roles', pol.policyname);
  END LOOP;
END $$;

-- Belt-and-suspenders: ensure a SELECT policy still exists (recreate the standard permissive
-- one if the loop above happened to remove an 'ALL' policy that covered SELECT too).
DROP POLICY IF EXISTS "user_roles_select_authenticated" ON user_roles;
CREATE POLICY "user_roles_select_authenticated" ON user_roles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "user_roles_self_bootstrap_insert" ON user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    AND (
      role = 'tailor'
      OR NOT EXISTS (SELECT 1 FROM user_roles)
    )
  );

-- No UPDATE or DELETE policy for `authenticated` at all — every legitimate change to an
-- EXISTING row (role change, rename, phone, employee link) now happens exclusively through
-- the service-role client in the manageUsers-gated API routes.
