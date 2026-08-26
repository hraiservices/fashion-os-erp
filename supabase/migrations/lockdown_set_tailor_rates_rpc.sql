-- add_tailor_rates_lockdown.sql blocked a direct app_settings upsert for the tailorRates key
-- and routed writes through the set_tailor_rates() RPC instead — but that migration's own
-- comment admits the RPC "has no in-SQL permission check" and just relies on "only ever being
-- invoked from the managePayroll-gated server route, not called directly." That reliance was
-- false: the RPC is SECURITY DEFINER (it bypasses RLS on app_settings once called at all) and
-- was GRANTed to `authenticated`, so any logged-in user — including a piece-rate tailor whose
-- own pay is computed from this exact rate card — could call
--   supabase.rpc('set_tailor_rates', { p_value: { ...inflated rates... } })
-- directly from the browser console and rewrite everyone's piece rates, with the API route's
-- managePayroll check never in the path at all.
--
-- Fix: only service_role may execute this function now. The one legitimate caller,
-- /api/settings/tailor-rates, was updated alongside this migration to call it through
-- createServiceClient() after its existing managePayroll check.
REVOKE EXECUTE ON FUNCTION set_tailor_rates(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_tailor_rates(JSONB) TO service_role;
