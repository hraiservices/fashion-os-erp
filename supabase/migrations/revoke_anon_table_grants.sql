-- Forensic Supabase audit (2026-09-19/20): `anon` currently holds full table-level privileges
-- (INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on app_settings, customers,
-- and orders — confirmed via information_schema.role_table_grants. This is far broader than
-- anything enable_chatbot_access() ever granted (that function only ever ran `GRANT SELECT`),
-- so this predates it or was applied by hand separately.
--
-- Right now RLS is the ONLY thing stopping an unauthenticated request (just the public anon key,
-- which ships in every client bundle as NEXT_PUBLIC_SUPABASE_ANON_KEY) from writing to or
-- deleting from these three tables — Section 1 of this audit's policy dump shows zero
-- anon-permissive policies on any of them today, so nothing currently gets through. But that
-- makes RLS a single point of failure rather than defense-in-depth: one future migration that
-- adds even a narrow anon policy to any of these tables, or any code path that ever queries them
-- as anon outside RLS enforcement, would immediately expose full CRUD on customer PII, order
-- financials, and app secrets (app_settings still holds plaintext API keys/webhook tokens for
-- the three keys not yet migrated to Supabase Vault) to the entire internet.
--
-- Fix: revoke every privilege from anon on all three tables. Confirmed safe — nothing in the
-- application legitimately queries these tables as anon (the public customer/invoice
-- self-service pages go through get_customer_order_status()/get_public_invoice(), which are
-- SECURITY DEFINER and read with the *function owner's* privileges, not anon's table grants, so
-- revoking these table-level grants does not affect them).

REVOKE ALL PRIVILEGES ON public.app_settings FROM anon;
REVOKE ALL PRIVILEGES ON public.customers FROM anon;
REVOKE ALL PRIVILEGES ON public.orders FROM anon;
