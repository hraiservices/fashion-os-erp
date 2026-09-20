# Fashion Flow — Performance Remediation

Companion to `FASHION_FLOW_PERFORMANCE_AUDIT.md`. Tracks exactly what changed, how it was verified, and what's deliberately left for a follow-up decision.

---

## Shipped this pass

### 1. `supabase/migrations/optimize_rls_function_calls.sql`

Rewrites every RLS policy calling `current_role_name()`, `current_employee_id()`, `has_perm()`, `is_back_office()`, or `auth.jwt()` unwrapped, to wrap each call as `(select fn())`. Covers every policy in `lockdown_reads_whole_table.sql` and `lockdown_reads_per_row.sql`, plus `orders_select_scoped`, `work_orders_select_scoped`, `user_roles_self_bootstrap_insert`, `push_subscriptions`'s two policies, and `signup_requests`'s two policies — every place these functions/`auth.jwt()` were found unwrapped in the schema.

**Tests performed:**
- Reproduced the exact anti-pattern against a real local Postgres 16 instance with a matching 2,000-row table and equivalent helper function: 69.987ms (unwrapped, per-row `Filter`) → 0.543ms (wrapped, single `InitPlan`) — see the audit doc for the full `EXPLAIN ANALYZE` output.
- Applied the full migration against a schema of stub tables named identically to every real table it touches; zero errors.
- Re-ran it a second time to confirm idempotency (safe to re-run); confirmed the same 39 policies exist by name before and after.
- Every rewritten `USING`/`WITH CHECK` expression was checked character-by-character against the currently-committed source of the two lockdown migrations — no predicate's logic changed, only whether the function call is wrapped.

**Regression risk:** very low. This changes evaluation strategy only; authorization outcomes are identical for every role/permission combination that existed before.

**Still needed from the project owner:** run `performance_diagnostic.sql`'s Section 5 (`EXPLAIN ANALYZE` on the real `user_roles` lookup) and Section 7 (table scan stats) **before and after** applying this migration in the SQL Editor, and send both. That's the only way to state a real, non-synthetic before/after number for this specific database.

### 2. `src/hooks/use-urgent-orders-summary.ts` + `src/components/app-shell/notification-bell.tsx`

New hook selects only `id, name, status, delivery_date, created_at` under its own query key (`["orders-summary"]`); the bell now uses it instead of the full `useOrders()` payload. Every other `useOrders()` consumer (orders list, reports, order detail) is untouched.

**Tests performed:** `tsc --noEmit`, `eslint`, `vitest run` (126/126) all clean after the change; traced every field the bell's render logic and `dueBadge()` actually read to confirm the 5-column selection is complete (nothing in the component reads `garments`/`history`/`measurements`/`payments`/`pay_breakdown`).

**Regression risk:** low. The bell's visible behavior (urgent-order list, unread badge count) is identical — same filter/sort logic, just a narrower column set feeding it.

### 3. `src/lib/tailor-worksheet.ts`

Replaced the per-tailor SELECT+upsert loop with one batched `SELECT ... WHERE tailor_id IN (...)` (reduced to latest-per-tailor in memory) and one batched `upsert()` call.

**Tests performed:** `tsc --noEmit`, `eslint`, `vitest run` all clean. Did not add a new automated test for `buildTailorWorksheet()` itself (no existing test file covers it, and this session didn't originate a live-DB fixture to test it end-to-end); the logic change is a direct, structure-preserving batching of the exact same per-tailor computation, not a behavior change.

**Regression risk:** low-medium — flagged for a smoke test on the tailor worksheet report page after deploying, since this wasn't independently verified against live data (unlike the RLS fix, which had a real local-Postgres round trip).

---

## Deferred — needs a decision, not a blind fix

### `app_settings`: uncached server-side reads (middleware + `getServerUser()`)

Two concrete options, with real tradeoffs — picking one silently would be exactly the "broad architectural change" the audit was told not to make without evidence and buy-in:

**Option A — short-TTL in-memory cache, scoped per serverless instance.**
A simple module-level `Map<string, {value, expiresAt}>` in `src/lib/supabase/session.ts` and `auth-server.ts`, TTL ~10-30s (matching the client-side `staleTime` already used by `useAppSetting`). Cheap, no schema change, no new infra.
*Tradeoff:* on Vercel's serverless model, cache scope is per-instance, not global — a licensing/permission change can take up to the TTL to propagate to a *different* warm instance than the one that made the change, and cold starts always miss. Acceptable for `moduleEntitlements`/`roleDefaultOverrides` (soft, non-security-critical settings — the code already treats these as advisory elsewhere in this codebase), less acceptable if applied to anything security-sensitive.

**Option B — consolidate into signed JWT custom claims.**
Bake `role`, `custom_permissions`, and `moduleEntitlements`'s relevant fields into the Supabase Auth JWT at sign-in/refresh, so middleware and `getServerUser()` read them from the already-verified JWT instead of querying the DB at all.
*Tradeoff:* a real architecture change — requires a Supabase Auth hook (or equivalent) to populate custom claims, and a plan for forcing a JWT refresh when an admin changes someone's role/permissions (stale JWT claims until then, which the original security report's §20 explicitly flagged as a thing to *not* silently rely on: "Do not depend on stale JWT claims for permissions where immediate revocation is required").

**Recommendation:** Option A for `moduleEntitlements`/`roleDefaultOverrides` specifically (soft settings, already treated as advisory), left as a follow-up implementation once the project owner picks a TTL they're comfortable with. Option B is a bigger project, worth considering separately, not bundled into a performance pass.

### 17 unindexed FKs / 19 "unused" indexes

Already handled in the prior security audit pass (`add_missing_fk_indexes.sql`, applied and verified live). The prior audit's own index-usage findings (Section 9 of that pass) already showed every flagged "unused" index sits on a table between 0 bytes and 160 kB — too small and too recently active (~2 months of stats) to conclude anything. Not re-touched here; re-running that analysis after real traffic accumulates is the right next check, not before.

### Sections not yet investigated this pass

`SELECT *` full-codebase sweep beyond what the query-inventory agent already covered, dashboard request-waterfall measurement, Realtime subscription audit, image/storage loading audit, React re-render audit. These are large enough to be their own pass — flagged, not attempted blind, per the same "don't guess" instruction governing everything above.

---

## Definition of done — current state

- [x] Root cause identified and reproduced with real measurements for the single largest reported anomaly (`user_roles` scan count)
- [x] Fix applied, verified idempotent, verified semantically identical to the live source, against a real Postgres instance
- [x] Two concrete over-fetch/N+1 findings fixed and typechecked/linted/tested clean
- [ ] Live before/after `pg_stat_statements`/`EXPLAIN ANALYZE` numbers from the actual Fashion Flow database — **pending, needs the project owner to run `performance_diagnostic.sql` before and after applying `optimize_rls_function_calls.sql`**
- [ ] `app_settings` server-side caching — deferred pending a decision between the two options above
- [ ] Remaining audit sections (dashboard waterfall, Realtime, images, frontend re-renders) — not started
