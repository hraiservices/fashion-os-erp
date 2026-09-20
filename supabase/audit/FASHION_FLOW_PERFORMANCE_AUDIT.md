# Fashion Flow — Performance Forensic Audit

**Scope:** live Supabase database (via a read-only diagnostic script, since this session has no network path to the project — same constraint as the earlier security audit) + full repository code inspection.
**Method:** the incoming report gave aggregated `pg_stat_statements` numbers (calls/mean/max) with no query text, no role attribution, and no code tracing. This document replaces those assumptions with evidence: exact file:line citations for every code-side claim, and a from-scratch local Postgres reproduction (not a guess) for the one claim that most needed proving.

---

## Executive summary

Two of the report's hypotheses are **confirmed, root-caused, and fixed**. Two are **confirmed as real but only partially fixed** (fix shipped for the one concrete instance found; the underlying architecture needs a larger follow-up this pass didn't attempt blindly). The rest require live `EXPLAIN ANALYZE`/`pg_stat_statements` text the project owner has been asked to provide — this document will be updated once that arrives.

| # | Finding | Status |
|---|---|---|
| 1 | `user_roles` — 739K seq scans / 89 index scans on a 3-row table | **Root-caused + fixed + reproduced locally with real numbers** |
| 2 | Notification bell over-fetches full order JSONB on every page | **Confirmed + fixed** |
| 3 | N+1 in `buildTailorWorksheet()` | **Confirmed + fixed** |
| 4 | `app_settings` — 46,176 calls | **Root-caused (server-side, uncached); NOT fixed this pass — see Remediation doc §"Deferred"** |
| 5 | 17 unindexed FKs / 19 unused indexes | **Already addressed in the prior security audit pass** (see `add_missing_fk_indexes.sql`); not re-touched here per "don't blindly index" instruction |
| 6 | Whether the reported query volume is Fashion Flow traffic or Supabase/tooling traffic | **Resolved — see "Traffic attribution" below. ~66% of total DB time in this window was Supabase/PostgREST/Studio/Auth internal overhead, not application code.** |

---

## Traffic attribution — the correction that changes the overall verdict

Live `pg_stat_statements` grouped by executing role, across the full stats window (~2 months since 2026-07-24):

| Attribution | Roles | Total calls | Total time | Share of total DB time |
|---|---|---:|---:|---:|
| **Fashion Flow's own traffic** | `authenticated` + `anon` + `service_role` | ~403,900 | ~759s | **~34%** |
| **Supabase/PostgREST/Studio/Auth internal tooling** | `authenticator` + `postgres` + `supabase_admin` + `supabase_auth_admin` | ~903,400 | ~1,464s | **~66%** |

The single largest total-time consumer in the entire system — `SELECT name FROM pg_timezone_names`, 1,290 calls, mean 463ms, **~597 seconds total, more than all of `app_settings` combined** — runs as `authenticator`, PostgREST's own internal connection role. This is PostgREST's schema-cache-reload machinery (it re-validates timezone strings on every cache reload), not Fashion Flow code. The same is true of a cluster of `postgres`/`supabase_admin`-role entries (`pg_available_extensions` introspection, function/type/domain introspection, an RLS/relation-introspection query averaging 1,485ms per call, a realtime-subscription existence check) — all Supabase Studio/tooling, not the application.

**Caveat, stated plainly:** this audit itself applied a dense sequence of migrations in a short window immediately before this measurement. PostgREST reloads its schema cache on DDL changes, so some fraction of this "tooling overhead" total is very likely inflated by the audit's own migration activity and should settle down now that it's finished — this number should not be read as a permanent steady-state baseline.

**What this changes:** the original report's implicit framing — "Fashion Flow is doing too much repeated database work" as the dominant explanation for the *entire* reported time total — does not hold up once traffic is actually separated by role, exactly as the report's own §13 said to check before concluding anything. Fashion Flow's real, addressable footprint is real (34% of ~2,227s is still ~759 seconds of real application-driven database time over 2 months) but is roughly a third of the picture, not the whole of it. The findings below remain valid and worth fixing on their own merits — they just shouldn't be read as explaining 100% of "the app feels slow."

---

## Finding #1 — `user_roles`: 739,423 sequential scans vs. 89 index scans (CONFIRMED, FIXED)

### Root cause

`current_role_name()`, `current_employee_id()`, `has_perm(flag)`, `is_back_office()` (all defined in `supabase/migrations/add_rls_identity_helpers.sql`) each internally run:

```sql
SELECT ... FROM user_roles WHERE lower(email) = lower(auth.jwt()->>'email') LIMIT 1
```

Every RLS policy in this schema that gates a read calls one or more of these **unwrapped** inside its `USING` clause, e.g. (`lockdown_reads_whole_table.sql`):

```sql
USING (is_back_office())
USING (has_perm('managePurchases'))
```

This is the documented Postgres/Supabase RLS performance anti-pattern (Supabase's own linter names it `auth_rls_initplan`): an unwrapped function reference in a policy is **re-evaluated once per row** the query touches, not once per statement. Each of those per-row evaluations issues its own fresh `user_roles` lookup. With `orders`, `expenses`, `sales_invoices`, and a dozen other tables all gated this way and scanned repeatedly (per the report's own top-hotspot list), the arithmetic of "739K seq scans on a 3-row table, 89 index scans" is exactly what row-by-row re-evaluation produces — it is not explained by table size or a missing index; `user_roles` is tiny by design.

### Proof, not assertion

Rather than trust that explanation, it was reproduced directly against a real local Postgres 16 instance: a 2,000-row table with a policy calling an equivalent helper function.

**Unwrapped** (`USING (is_back_office())`):
```
Seq Scan on orders (actual time=69.969..69.970 rows=0 loops=1)
  Filter: is_back_office()
  Rows Removed by Filter: 2000
Execution Time: 69.987 ms
```

**Wrapped** (`USING ((select is_back_office()))`):
```
Seq Scan on orders (actual time=0.516..0.516 rows=0 loops=1)
  Filter: $0
  Rows Removed by Filter: 2000
  InitPlan 1 (returns $0)
    ->  Result (actual time=0.432..0.433 rows=1 loops=1)
Execution Time: 0.543 ms
```

**128x** on this synthetic 2,000-row case. The unwrapped version evaluates the function as a per-row `Filter`; the wrapped version collapses it into a single `InitPlan` evaluated once and reused for every row. This is not a theoretical optimization — it changes the actual query plan, provably.

### Fix

`supabase/migrations/optimize_rls_function_calls.sql` recreates every affected policy **under its existing name** with every helper-function call (and every direct `auth.jwt()` reference) wrapped as `(select fn())`. Zero semantic change — every predicate was verified line-by-line against the live source of `lockdown_reads_per_row.sql` and `lockdown_reads_whole_table.sql` before being rewritten. Applied and verified idempotent against a local Postgres instance (same 39 policies present, by name, before and after; safe to re-run).

### What's still open

The 128x number above is from a synthetic case. **This document cannot claim a specific real-world before/after number for Fashion Flow's actual `user_roles` scan count until the migration is applied live and the same diagnostic query is re-run.** Section 8 and Section 5 of `performance_diagnostic.sql` (sent separately) are built for exactly this — please run them before and after applying `optimize_rls_function_calls.sql` and send both sets of numbers.

---

## Finding #2 — Notification bell over-fetches (CONFIRMED, FIXED)

`src/components/app-shell/notification-bell.tsx` (rendered in the global app shell — every authenticated page, not just the orders screen) called `useOrders()`, whose query selects every JSONB column on the table: `garments, history, measurements, payments, pay_breakdown` — all so it could compute a badge count from `dueBadge()`, which only ever reads `status` and `deliveryDate` (`src/lib/business-rules.ts:215`), plus `id`, `name`, `createdAt` for display.

**Fix:** new `src/hooks/use-urgent-orders-summary.ts`, selecting only those 5 lean columns under its own query key (`["orders-summary"]`, deliberately separate from `["orders"]` — this is a genuinely smaller payload, not a lighter view of the same cache entry). Every other consumer of `useOrders()` (the orders list page, reports, order detail) is untouched and still gets the full payload it actually needs.

---

## Finding #3 — N+1 in `buildTailorWorksheet()` (CONFIRMED, FIXED)

`src/lib/tailor-worksheet.ts` looped over every tailor with pending work and issued one `tailor_worksheet_snapshots` SELECT plus one upsert **per tailor**, inside the loop. Low absolute call volume (bounded by the number of active tailors, not by order/customer count), so it didn't appear in the top-hotspot list, but it's a genuine N+1 confirmed by direct code reading.

**Fix:** one batched `SELECT ... WHERE tailor_id IN (...)` covering every tailor, reduced to "latest snapshot before today, per tailor" in memory (Supabase's query builder has no `DISTINCT ON` support, and each tailor's snapshot history is small enough that this is a correct, cheap reduction); and one batched `upsert()` call with an array of rows instead of one call per tailor.

---

## Finding #4 — `app_settings`: 46,176 calls (CONFIRMED ROOT CAUSE, NOT FIXED THIS PASS)

**Client-side hooks are not the problem.** Every one of the ~9 hooks reading `app_settings` (`use-app-setting.ts`, `use-module-entitlements.ts`, `use-current-tailor-rates.ts`, `use-measure-fields.ts`, `use-whatsapp-cloud-api.ts`, `use-ai-copilot-config.ts`, `use-claude-copilot-config.ts`, `use-current-user.ts`) uses React Query with a stable, per-key `queryKey` and a `staleTime` — calls to the same setting from multiple components correctly dedupe and cache client-side. This part of the report's hypothesis does not hold up under code inspection.

**The real problem is server-side, and uncached:**
- `src/lib/supabase/session.ts` (Next.js **middleware**, runs on every navigation) reads `app_settings.moduleEntitlements` fresh, every request, for every authenticated non-super-admin user.
- `src/lib/auth-server.ts`'s `getServerUser()` (called at the top of most API routes) reads `user_roles` + `app_settings.roleDefaultOverrides` fresh, every invocation, with zero request-scoped memoization.
- ~25 individual API routes each do their own uncached `app_settings` read per invocation.

There is no caching layer anywhere in the codebase for these server-side reads (`grep -r "unstable_cache"` and equivalent found nothing relevant). Middleware runs before Next.js's React Server Component render tree even starts, so `React.cache()` (per-request memoization) cannot span across it and into `getServerUser()` — they are two genuinely separate invocations per request today.

**Why this wasn't fixed in this pass:** this is a real architectural gap, not a one-line fix, and the report's own instruction is explicit — "do not make broad architectural changes merely because they sound theoretically faster." Two real options exist (a short-TTL in-memory cache scoped to the serverless instance, or consolidating `moduleEntitlements`/role data into signed JWT custom claims so neither middleware nor `getServerUser()` needs a DB round trip at all) and choosing between them changes how licensing/permission changes propagate (staleness window) — that's a decision for the project owner, not something to decide silently. See the Remediation document's "Deferred" section for the concrete options and their tradeoffs.

**Denominator, now confirmed:** `pg_stat_statements` shows PostgREST's own per-request session-setup call (`set_config(...)`, cheap at 0.14ms mean but universal) ran 168,976 times in this window — that's the real total request count. `app_settings`'s 50,250 combined calls (`authenticated` + `anon` + `service_role` variants) are therefore **~30% of every single request this API served**, not an isolated hotspot — strong, direct confirmation this is worth fixing, whichever option is chosen.

**A live, real anomaly worth a second look:** the identical `app_settings` key-lookup query is dramatically cheaper under `service_role` (mean 0.34ms) than under `authenticated` (5.30ms) or `anon` (16.47ms) — a ~15–48x gap on byte-identical SQL, measured by Postgres itself (not network/auth-handshake time). A direct `EXPLAIN (ANALYZE, BUFFERS)` of the same query as `authenticated` came back at **0.021ms execution, clean index scan, 2 buffer hits** — ruling out the query/RLS-policy shape as the cause. The gap is therefore being spent in PostgREST's own per-request session setup and/or connection-pooler contention under concurrent load, not in anything a schema or index change can fix — it reinforces that request *volume*, not query cost, is the real lever here.

---

## Findings not yet resolvable from this session

- **Section 3 of the diagnostic** (which role runs the reported queries) — needed to separate Fashion Flow's own traffic from Supabase dashboard/PostgREST introspection traffic, per the original report's own caution (§13). Not yet received.
- **Sections 4, 5, 6** (live `EXPLAIN ANALYZE` for the orders query and the `user_roles` lookup, and whether `idx_user_roles_lower_email` — flagged "unused" in the security audit — actually matches the query shape the RLS policies use) — this last one specifically could be an *additional*, independent cause of the seq-scan volume, on top of Finding #1's unwrapped-function cause. Not yet received.
- **`SELECT *` audit, dashboard request waterfall, realtime subscription audit, image/storage audit** — the original report's §14–§23 are large, multi-screen investigations. Not attempted in this pass given the scope already covered; flagged as follow-up work if the fixes above don't fully resolve the reported slowness.
