-- Forensic audit finding (CRITICAL): confirm_order_payables() and confirm_wo_payable()
-- (add_piece_rate_p0_fixes.sql) are SECURITY DEFINER — by design, so they can set
-- payables_confirmed_at / labor_payable_confirmed_at despite the trigger that blocks every other
-- write path from touching those columns. But both were also `GRANT EXECUTE ... TO authenticated`,
-- with no permission check inside the function body itself. SECURITY DEFINER means they run with
-- the function owner's privileges and bypass RLS entirely — so that grant is not "the API route
-- can call this", it is "any logged-in user's browser can call this directly":
--
--   supabase.rpc('confirm_order_payables', { p_order_id: '<any order>', p_user_email: 'x' })
--
-- This completely bypasses the managePayroll check both API routes enforce (which is the whole
-- point of the "second checkpoint" design — see the routes' own comments), skips the audit log
-- entry those routes write, and lets exactly the self-dealing case the routes' comments worry
-- about happen with no review trail at all: a tailor (or anyone else logged in, permissions
-- irrelevant) can confirm their own or anyone else's piece-rate payable on demand.
--
-- Fix: same lockdown already applied to set_tailor_rates_versioned
-- (add_tailor_rate_versions.sql) and set_tailor_rates (lockdown_set_tailor_rates_rpc.sql) —
-- revoke the authenticated grant, restrict to service_role only. The two API routes are updated
-- in the same change to call these RPCs via the service-role client instead of the caller's own
-- session client (they already hold a service client for the row lookup, so this is a one-line
-- swap per route, not a new dependency).
REVOKE ALL ON FUNCTION confirm_order_payables(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_order_payables(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION confirm_order_payables(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION confirm_wo_payable(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_wo_payable(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION confirm_wo_payable(TEXT, TEXT) TO service_role;

-- Same audit also flagged approve_leave_request (add_leave_management.sql) as granted to
-- authenticated. Unlike the two above it is NOT SECURITY DEFINER, so RLS already blocks its
-- internal UPDATE on leave_requests for a direct caller (lockdown_operational_writes.sql
-- revoked all authenticated writes on that table) — calling it directly is a harmless no-op, not
-- an exploit. But the grant is still misleading (a later migration's own comment mistakenly
-- lists this function alongside the real SECURITY DEFINER ones) and serves no purpose now that
-- its route is being moved onto the service client below, so it's tightened the same way for
-- consistency and to stop the confusion from recurring.
REVOKE ALL ON FUNCTION approve_leave_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION approve_leave_request(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION approve_leave_request(UUID, TEXT) TO service_role;
