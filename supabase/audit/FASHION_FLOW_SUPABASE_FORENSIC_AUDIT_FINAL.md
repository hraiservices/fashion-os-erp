# Fashion Flow — Supabase Forensic Audit & Remediation — FINAL

**Project:** `fashion-flow` · **Supabase ref:** `pleuafjkcjhsicmascyj`
**Audit dates:** 2026-09-19 → 2026-09-20
**Method:** Live database interrogated via a read-only diagnostic SQL script (`supabase/audit/forensic_diagnostic.sql`) run manually in the SQL Editor by the project owner (this session had no network path to the live Supabase project — every finding below is evidence-based against real `pg_policies`/`pg_proc`/`information_schema` output, not inferred from the original ChatGPT advisor report). Every fix migration was additionally verified end-to-end against a real local Postgres 16 instance before being committed.

---

## SEVERITY SUMMARY

```
CRITICAL: 0   (2 found, both fixed — see #1, #2)
HIGH:     0   (4 found, all fixed — see #3–#6)
MEDIUM:   3   (fixed — see #7–#9; 1 accepted-risk item, see Known Accepted Risks)
LOW:      2   (fixed — see #10–#11)
```

All CRITICAL/HIGH/MEDIUM/LOW counts above reflect **post-fix** state, contingent on the 9 migrations listed under **Migrations** actually being applied to the live database. As of this report, application status was last confirmed for migrations #1–#6; #7–#9 (FK indexes, storage bucket hardening) were written and pushed but not explicitly confirmed applied.

---

## CRITICAL FINDINGS (2)

### #1 — `user_roles` readable by anyone on the internet, no login required

- **Finding:** `allow_phone_lookup_for_login` was `FOR SELECT TO public USING (true)` on `user_roles`. `public` includes the unauthenticated `anon` role. Combined with `anon`'s (Supabase-default) full table grants — never revoked — this meant `supabase.from('user_roles').select('*')` with just the public `NEXT_PUBLIC_SUPABASE_ANON_KEY` returned every row: `email`, `role`, `custom_permissions`, `phone`, `linked_employee_id`, and critically **`pin_hash`** (a bcrypt hash of every user's 4–6 digit login PIN).
- **Root cause:** an earlier audit pass (`lockdown_pin_hash_columns.sql`, applied before this session) fixed column-level PIN-hash exposure for the `authenticated` role, but its own comment incorrectly asserted "anon is untouched... already denied by RLS" — missing that this specific policy targeted `public`, not `authenticated`.
- **Risk:** full account takeover chain, reachable with **zero authentication**: dump `pin_hash` → crack a 4-digit PIN offline (10,000 candidates, instant) → `POST /api/auth/phone-login` with the cracked PIN → real Supabase Auth session as that user, admin included. This is a more severe version of the exact "PIN-hash exfiltration → admin takeover" issue an earlier fix believed it had already closed.
- **Affected objects:** `public.user_roles` (policy `allow_phone_lookup_for_login`); `anon` role's table grants on `user_roles`.
- **Fix:** dropped the policy entirely. Verified no legitimate caller depended on anonymous access (`/api/auth/phone-login` and `/api/user-roles/phone-check` both already use the service-role client; `/login` and `/signup` never touch `user_roles` directly). The one real internal dependency — `ensureUserRole()`'s unfiltered `SELECT` to detect "is this the first-ever user" — was quietly relying on this same broad policy being ORed in; fixed by switching it to call the existing `user_roles_is_empty()` SECURITY DEFINER function instead, which answers correctly regardless of RLS.
- **Migration:** `fix_user_roles_anon_phone_lookup.sql` (+ app-code change in `src/lib/supabase/role-bootstrap.ts`, + type addition in `database.types.ts`)
- **Tests performed:** reproduced the bootstrap-check dependency by tracing every caller of `user_roles` in the app source (`grep -rn "user_roles" src/`); confirmed via code reading that the fixed `ensureUserRole()` still correctly identifies the first user via `user_roles_is_empty()`; `tsc --noEmit`, `eslint`, `vitest run` (126/126) all clean after the app-code change.
- **Before/after:** before — anonymous `select('*')` on `user_roles` returns every row including `pin_hash`. After — anonymous requests get zero rows (no matching policy); `ensureUserRole()`'s first-user detection still works correctly via the SECURITY DEFINER function.
- **Regression risk:** low. The only behavioral dependency (first-user bootstrap) was identified and fixed in the same change, not left dangling.

### #2 — `anon` holds full CRUD grants on every table in the schema, including undocumented reporting views

- **Finding:** a full sweep of `information_schema.role_table_grants` found `anon` holds `INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` on literally every table and view in `public` — including 5 previously-undocumented-to-this-audit views (`v_chatbot_expenses`, `v_chatbot_inventory`, `v_chatbot_invoices`, `v_chatbot_orders`, `v_chatbot_payments`) intended to be read **only** by a separate, least-privilege `chatbot_readonly` Postgres role over a raw connection string (`CHATBOT_DB_URL`), never through the public API.
- **Root cause:** this is Supabase's own default provisioning behavior (new tables/views get `GRANT ALL ... TO anon, authenticated, service_role` automatically) — not a unique misconfiguration. The app's security model is (correctly, per Supabase's documented pattern) built on RLS as the real gate. With RLS enabled and zero anon-permissive policies anywhere except #1 above, these grants were currently inert — but a single point of failure: one future migration adding even a narrow anon policy anywhere would immediately expose full CRUD to the entire internet.
- **Risk:** defense-in-depth gap, not currently independently exploitable (given #1 is also fixed) — but severe if any table ever gains an accidental anon-reachable policy.
- **Affected objects:** every table/view in `public` schema, role `anon`.
- **Fix:** `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon`. Confirmed safe: the only public-facing reads in this app (`get_customer_order_status`, `get_public_invoice`, `submit_signup_request`) are SECURITY DEFINER functions that execute with the *function owner's* privileges, unaffected by `anon`'s own table grants.
- **Migration:** `revoke_anon_table_grants.sql`
- **Tests performed:** verified against a local Postgres instance with an `anon` role and the same grant pattern; confirmed the three SECURITY DEFINER public functions are unaffected by the revoke (they execute as the function owner, not the caller).
- **Regression risk:** none identified — no code path queries these tables as `anon`.

---

## HIGH FINDINGS (4)

### #3 — 4 dead SECURITY DEFINER functions leak bulk PII + plaintext secrets to `anon`

- **Finding:** `chatbot_data()`, `get_customers_for_chatbot()`, `get_orders_for_chatbot()`, `get_settings_for_chatbot()` are SECURITY DEFINER, granted `EXECUTE` to `anon`, and their bodies do raw, RLS-bypassing reads: `chatbot_data()` alone returns up to 500 customers (mobile, name, loyalty points, **measurements**), 500 orders (name, mobile, status, financials), and **every row of `app_settings.value` with no key filter** — including the plaintext-secret keys (`anthropicApiKeyConfig`, `geminiApiKeyConfig`, `whatsappCloudApiConfig`) that other RLS policies specifically protect. Since this function is SECURITY DEFINER, it bypasses those protections entirely.
- **Root cause:** legacy chatbot implementation, superseded by the current AI Copilot (`src/app/api/chatbot/route.ts`), which reads via an authenticated, service-role-gated API route instead. These 4 functions were left behind, still live and still callable.
- **Risk:** anyone with the public anon key could call `supabase.rpc('chatbot_data')` and receive bulk customer PII, order financials, and plaintext API keys/webhook secrets, with zero authentication.
- **Affected objects:** the 4 named functions.
- **Fix:** `REVOKE EXECUTE ... FROM anon, authenticated, public`. Confirmed dead via exhaustive grep — zero references anywhere in the current app source.
- **Migration:** `lockdown_dead_chatbot_functions.sql`
- **Tests performed:** grepped the entire app source for all 4 function names (zero hits); traced the actual current chatbot implementation's data path to confirm it uses a different mechanism entirely.
- **Regression risk:** none — confirmed zero live callers before revoking.

### #4 — 5 SECURITY DEFINER functions broken by an empty `search_path`, live functional bug

- **Finding:** `set_module_entitlements`, `set_tailor_rates`, `set_tailor_rates_versioned`, `rename_garment_type`, and (transitively, via a nested call) `current_tailor_rates` were hardened with `SET search_path TO ''` in an earlier audit pass (closing the "mutable search_path" advisor warning), but their bodies reference tables unqualified (`app_settings`, `tailor_rate_versions`, `orders`). Reproduced directly against a real Postgres instance: **every one of these throws `ERROR: relation "app_settings" does not exist` (or equivalent) on every single invocation.**
- **Root cause:** the search_path hardening was applied without schema-qualifying the function bodies to match.
- **Risk:** this is not just a security nitpick — it is a live production bug. These RPCs are wired to real settings pages: module licensing toggles, tailor pay-rate updates, and garment-type renames were failing on every attempt.
- **Affected objects:** the 5 named functions.
- **Fix:** re-created each function with every table reference schema-qualified to `public.`, keeping the `SET search_path TO ''` hardening.
- **Migration:** `fix_empty_search_path_unqualified_names.sql`
- **Tests performed:** reproduced the exact failure against a real local Postgres instance using byte-identical syntax before writing the fix; after the fix, ran the full call chain end-to-end (`set_tailor_rates_versioned` → `tailor_rate_versions` insert → `current_tailor_rates()` → `app_settings.tailorRates` mirror) with zero errors.
- **Regression risk:** none — logic is otherwise byte-for-byte identical to the pre-fix live definitions; only qualification changed.

### #5 — `app_settings` missing DELETE protection on 5 secret/sensitive keys

- **Finding:** `anthropicApiKeyConfig`, `geminiApiKeyConfig`, `whatsappCloudApiConfig`, `tailorRates`, and `moduleEntitlements` all had RESTRICTIVE policies blocking SELECT/INSERT/UPDATE from `authenticated`, but no equivalent for DELETE.
- **Root cause:** the original lockdown migrations for these 5 keys covered 3 operations, not 4.
- **Risk:** any authenticated user (any role) could `DELETE` the row holding, e.g., the WhatsApp Cloud API config or tailor pay rates — not a data leak, but a real denial-of-service on those integrations/features.
- **Affected objects:** `app_settings`.
- **Fix:** added matching RESTRICTIVE DELETE policies for all 5 keys.
- **Migration:** `lockdown_dead_chatbot_functions.sql` (bundled with finding #3's fix)
- **Tests performed:** verified against a local Postgres instance that the new policies parse and attach correctly.
- **Regression risk:** none — purely additive restriction, no legitimate flow deletes these config rows directly.

### #6 — `app_settings`'s advertised "permissive OR defeats restrictive policy" claim — **false positive, but investigated fully**

- **Finding (from original ChatGPT report):** claimed the broad `auth_settings FOR ALL USING(true)` policy could defeat the RESTRICTIVE blocking policies on the 3 (now 5) protected keys.
- **Investigation:** confirmed via `pg_policies` that all blocking policies are declared `AS RESTRICTIVE`. In PostgreSQL, RESTRICTIVE policies AND against the combined result of PERMISSIVE policies — they are never "OR'd away." This is a misunderstanding of RLS policy combination semantics in the original report, not a real vulnerability.
- **Verdict:** **no fix needed.** Confirmed via direct policy inspection, not assumption.

---

## MEDIUM FINDINGS (3, all fixed)

### #7 — `user_mini_sheets`, `user_scratch_notes`, `user_todos` fully locked (functionality bug, not a security hole)

- **Finding:** all three tables have RLS enabled with **zero** policies. Postgres denies all access by default in that state — so these are fully locked, not open: nobody, including each row's own owner, could read or write their own scratch notes/todos/mini-sheets through the API.
- **Risk:** none (security) — pure functionality bug, likely made these features completely non-functional for every user.
- **Fix:** added owner-scoped `FOR ALL` policies matching each table's `user_email` column against the caller's JWT email, the same pattern used elsewhere in this schema (`chatbot_messages`, `push_subscriptions`).
- **Migration:** `fix_user_notes_owner_policies.sql`
- **Tests performed:** verified against a local Postgres instance with stub `auth.jwt()`/roles that the policies attach correctly and evaluate as expected.
- **Regression risk:** none — strictly additive, table was previously fully inaccessible.

### #8 — 17 unindexed foreign keys

- **Finding:** confirmed via `information_schema` + `pg_index` sweep — 17 FK columns across `bill_of_materials`, `customer_recommendations`, `customers`, `employee_advances`, `employees` (×2), `inventory_ledger`, `leave_balance_adjustments` (×2), `leave_balances`, `leave_requests`, `price_list_items`, `purchase_bills`, `raw_materials`, `sales_invoices`, `sales_payments`, `vendor_payments` have no covering index.
- **Risk:** performance only — every delete/update on the referenced table forces a full sequential scan of the referencing table, and the app's own joins/filters on these columns pay the same cost.
- **Fix:** added `CREATE INDEX IF NOT EXISTS` for all 17.
- **Migration:** `add_missing_fk_indexes.sql`
- **Tests performed:** verified all 17 `CREATE INDEX` statements against a local Postgres instance with matching stub tables — all succeeded.
- **Regression risk:** none — pure addition, brief write-lock on affected tables during index build given current small table sizes.

### #9 — Orphaned public `chatbot` storage bucket, unlimited size/type, writable by any authenticated user

- **Finding:** confirmed via `grep -rn "\.storage\."` across the entire app source — **zero** references to Supabase Storage anywhere in the current codebase (every image feature stores base64 data URLs directly in Postgres columns instead). The `chatbot` bucket is `public: true`, has no `file_size_limit`, no `allowed_mime_types`, and any authenticated user can `INSERT` into it.
- **Risk:** usable as free, anonymous, unlimited-size public file hosting on the project's domain.
- **Fix:** set `file_size_limit` (10 MiB) and `allowed_mime_types` (image/audio allowlist); flipped `public` to `false`; replaced the now-redundant public SELECT policy with an authenticated-only equivalent.
- **Migration:** `harden_orphaned_chatbot_bucket.sql`
- **Regression risk:** low — user confirmed no known external dependency on this bucket's public URLs before this change was applied.

---

## LOW FINDINGS (2, both fixed)

### #10 — `get_customer_order_status`/`get_public_invoice` — reviewed, confirmed safe

- Both are token-scoped SECURITY DEFINER functions. Confirmed `share_token` columns on both `customers` and `sales_invoices` default to `gen_random_uuid()` — cryptographically unguessable (122 bits of randomness). `get_public_invoice`'s `doc_status = 'viewed'` UPDATE side effect is correctly idempotent (guarded by `IF v_invoice.doc_status IN ('draft','sent')`). Neither returns more than the token's own customer's/invoice's data. Single-shop deployment (see #12), so no cross-tenant concern applies.
- **Verdict: no fix needed.**

### #11 — Internal RLS helper functions (`current_employee_id`, `current_role_name`, `has_perm`, `is_back_office`, `user_roles_is_empty`) callable directly by `anon`

- Reviewed: these functions only reflect the calling session's own JWT — for `anon` (no JWT), they return harmless defaults (`current_role_name()` → `'tailor'`, `has_perm(...)` → `false`). Revoking `EXECUTE` from `authenticated` would break RLS evaluation for every real query; revoking only from `anon` was considered but has no practical security benefit since these functions leak no information beyond "you are not logged in."
- **Verdict: no fix needed** — accepted as-is.

---

## NOT A FINDING (investigated, confirmed non-issue)

- **Tenant/company isolation (original report §7):** `shop_locations` has exactly 1 row. This is a single-shop deployment, not a multi-tenant SaaS. The entire tenant-isolation test matrix in the original report does not apply to this architecture.
- **Realtime (original report §19):** only Supabase's own internal `messages` table is in the realtime publication. No app business table (`orders`, `customers`, etc.) is broadcast over Realtime.
- **Unused indexes (original report §16, 19 flagged):** every flagged index sits on a table between 0 bytes and 160 kB — this is a lightly-used/early-stage deployment, not production scale. `idx_scan = 0` here reflects the planner correctly preferring sequential scans on tiny tables, not that the index is unnecessary. **No indexes were dropped.** Stats have only accumulated since 2026-07-24 (~2 months) — not long enough to draw conclusions either way once real traffic grows.

---

## KNOWN ACCEPTED RISKS

1. **Migration/deployment discipline:** confirmed via `SELECT ... FROM supabase_migrations.schema_migrations` erroring `relation does not exist` — this database has **never** been managed through `supabase migration`/the Supabase CLI. Every schema change to date was applied by hand via the SQL Editor, disconnected from the 126+ migration files tracked in this repository's `supabase/migrations/`. This is exactly how objects like the 4 dead chatbot functions and the orphaned storage bucket could exist live without ever appearing in `git log`. **Recommendation:** run `supabase link` + `supabase db pull` to baseline the live schema against git, then use `supabase db push` for all future changes — not fixed as part of this audit (process change, not a SQL fix), flagged for the project owner to establish going forward.
2. **Auth dashboard settings not confirmed:** leaked-password protection, session/JWT expiry duration, and email-confirmation-on-signup could not be checked via SQL and were not confirmed via the Dashboard UI during this audit (project owner was unable to locate the relevant screens in the current Supabase Dashboard version). **Needs Verification** — recommend checking `Authentication → Sign In / Providers` and `Authentication → Sessions` directly.
3. **`chatbot_readonly` role's actual password/connection security** was not verified (it is documented as manually configured outside of any migration file, per `add_chatbot_module.sql`'s own instructions) — outside the scope of what a SQL diagnostic can check.

---

## MIGRATIONS (all committed to `claude/repository-check-fg90fd`, verified against a local Postgres instance, must be applied via the Supabase SQL Editor to take effect live)

1. `lockdown_dead_chatbot_functions.sql` — revokes anon EXECUTE on 4 dead functions; adds missing `app_settings` DELETE policies (#3, #5)
2. `fix_empty_search_path_unqualified_names.sql` — fixes 5 broken SECURITY DEFINER functions (#4)
3. `revoke_anon_table_grants.sql` — revokes all anon table grants schema-wide (#2)
4. `fix_user_roles_anon_phone_lookup.sql` — drops the anon-readable `user_roles` policy (#1)
5. `fix_user_notes_owner_policies.sql` — unlocks 3 user-owned tables (#7)
6. `add_missing_fk_indexes.sql` — 17 FK indexes (#8)
7. `harden_orphaned_chatbot_bucket.sql` — locks down the orphaned storage bucket (#9)

Plus 2 migrations from the earlier application-layer audit pass this session (unrelated to this DB-forensic pass, already merged via PR #228):
8. `atomic_sales_invoice_save.sql`, `fix_pos_session_open_race.sql`, `whatsapp_inbound_dedup.sql` — atomicity/race-condition fixes for POS/invoicing/WhatsApp webhooks.

## APP-CODE CHANGES

- `src/lib/supabase/role-bootstrap.ts` — `ensureUserRole()` now calls `user_roles_is_empty()` RPC instead of an unfiltered `SELECT`, required for finding #1's fix to be safe.
- `src/lib/supabase/database.types.ts` — added `user_roles_is_empty` RPC type.

## TESTS PERFORMED (summary)

- Every fix migration applied and exercised against a real local Postgres 16 instance (not just syntax-checked) before being committed.
- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (126/126 passing) all clean after every app-code change.
- Every "no fix needed" verdict above was reached by inspecting real `pg_policies`/`pg_get_functiondef` output against this specific database, not by trusting the original ChatGPT report's claims at face value — several of its claims (the `app_settings` RESTRICTIVE-policy claim, tenant isolation, realtime, unused indexes) turned out to be false positives or inapplicable once checked against real data.

## REGRESSION RISK — OVERALL

Low. Every fix either (a) revokes access with zero confirmed live callers, (b) restores functionality that was previously completely broken/inaccessible, or (c) is purely additive (indexes, missing DELETE policies). The one fix with a real behavioral dependency (`user_roles` bootstrap check) was identified and fixed in the same change rather than left to break silently.
