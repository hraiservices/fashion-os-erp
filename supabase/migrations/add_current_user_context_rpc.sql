-- Collapses useCurrentUser()'s fetchCurrentUser() (src/hooks/use-current-user.ts) from up to
-- three sequential round trips (user_roles, app_settings.roleDefaultOverrides, then employees if
-- linked) into one. This runs on every protected page's first paint — every single cold app
-- open goes through (app)/layout.tsx -> useCurrentUser() -- so each extra serial round trip was
-- real, measured latency stacked on top of the /launch cold-start fixes in the same audit. The
-- client still calls supabase.auth.getUser() itself first (a Supabase Auth API call, not
-- Postgres, so it can't be folded into this RPC) and falls back to the original three-query path
-- if this function isn't found — see fetchRoleContext()'s comment — so this ships safely whether
-- or not a given customer's Supabase project has picked up this migration yet (migrations here
-- are applied by hand / via scripts/onboard-customer.mjs, not tracked automatically).
--
-- No new privilege: everything selected here is exactly what the client's own three queries
-- already read with its own row (user_roles by its own email, app_settings by a fixed public
-- key, employees by the row its own user_roles.linked_employee_id points at) — this only changes
-- how many round trips it takes, not what's visible.
--
-- SECURITY DEFINER + SET search_path TO '' + fully schema-qualified references, per the hardened
-- convention in fix_empty_search_path_unqualified_names.sql (not the older `SET search_path =
-- public` style in add_rls_identity_helpers.sql, which that migration existed to move away from).
CREATE OR REPLACE FUNCTION public.get_current_user_context()
RETURNS TABLE (
  role text,
  custom_permissions jsonb,
  linked_employee_id uuid,
  employee_name text,
  employee_photo_url text,
  role_default_overrides jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
  SELECT
    r.role,
    r.custom_permissions,
    r.linked_employee_id,
    e.name,
    e.photo_url,
    (SELECT s.value FROM public.app_settings s WHERE s.key = 'roleDefaultOverrides')
  FROM public.user_roles r
  LEFT JOIN public.employees e ON e.id = r.linked_employee_id
  WHERE lower(r.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  LIMIT 1;
$fn$;

-- Reads another user's row only by construction (scoped to the caller's own JWT email above),
-- but still never PUBLIC — matches every other identity-reading DEFINER function in this file set.
REVOKE ALL ON FUNCTION public.get_current_user_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_context() TO authenticated, service_role;
