# Pre-Live Audit — Fix Report

Two commits, neither pushed to remote:

- `7d88858` — P0-1 through P0-4 (privilege escalation, unauthorized writes, salary
  over-fetch, unbounded media payload)
- `29a92fc` — 6 of the 8 P1s below

## P1 fixes

**P1-1 — Payment idempotency.** `record_order_payment` gained an optimistic-lock
parameter (`p_expected_advance`), the same pattern `edit_order` already used. A
retried "Record Payment" click on a slow connection, or two staff acting on the
same order at once, now gets a 409 instead of silently applying cash twice.
Migration: `supabase/migrations/add_payment_idempotency.sql`. Wired through
[route.ts](src/app/api/orders/[id]/payment/route.ts), [use-order-mutations.ts](src/hooks/use-order-mutations.ts), and [payment-modal.tsx](src/components/orders/payment-modal.tsx) — this one needs the migration run before it's live.

**P1-2 — Forgeable discount markers.** `payMethod` is now a closed enum
(Cash/UPI/Card/Bank Transfer) instead of free text, and any note text is
stripped of the 🎁/🎟️/₹ characters the app's own history-parsing regexes use to
recover discount amounts — closes the path where a payment note could forge a
loyalty or coupon discount line.

**P1-7 — Loyalty redemption race.** Points are now reserved (row-locked,
deducted) *before* the payment RPC runs, not after reading a stale balance.
If the payment RPC then rejects, a compensating refund releases the points.

**P1-4 — P&L revenue basis.** Combined P&L's `salesRevenue` now excludes draft
invoices and subtracts `creditsTotal`, instead of counting unissued and
fully-credited-back invoices as revenue on the Net Profit/Margin cards.

**P1-5 — Order delete guard.** An order with a nonzero `advance` can no longer
be hard-deleted (returns 409: refund first or move to a closed stage).

**P1-6 — Customer delete guard.** `delete_customer_cascade` now also blocks on
issued (non-draft) sales invoices or any outstanding sales-invoice balance, and
cascades `sales_payments`/`sales_credit_notes`/`sales_invoices` for that
customer — previously deleting a customer silently orphaned all their retail
invoices, since those tables have no FK to `customers`.
Migration: `supabase/migrations/add_customer_delete_sales_guard.sql`.

**P1-3 — Attendance UTC/IST date bug.** Check-in/check-out/me ran in UTC on
Vercel, so for ~5.5 hours after IST midnight the attendance date was written as
the *previous* day — corrupting the record that payroll is computed from. Added
`src/lib/ist-date.ts` (fixed +5:30 offset — no DST in India) for the three
server routes, and exported the existing client-side local-date helper to fix
the same class of bug in the payroll page's date filters, the attendance
page's date filter, and the employee-advance date field.

## Not fixed as originally suggested

**P1-8 — Unauthenticated product-image route.** The audit flagged
`/api/products/[id]/image` as having no auth check. Its own docstring explains
why: it exists so Meta's WhatsApp Business Cloud API can fetch the photo
server-to-server (no session cookie is possible from Meta's servers) when
attaching a product image to an outbound WhatsApp message. Adding session auth
here would break that feature, not close a real hole — this route only ever
serves a public product photo, not sensitive data. Left as-is; documenting the
tradeoff here per the audit's own request to record deliberate exceptions.

## Not in scope for this pass

The 5 P2s from the original audit (PIN lockout counter reset, 3 coexisting
`edit_order` overloads, payroll run N+1 queries, blind customer-upsert
overwrite, missing FK on `inventory_ledger.item_id`) were not touched — "fix
the remaining issues" was scoped to the 8 P1s I'd called out as still open,
not the full P2 list. Flag if you want those picked up next.

## Verification

`npx tsc --noEmit`, `npm run build`, and `npm test` (27/27) all pass clean on
the final state. No live Supabase access in this environment, so nothing here
was verified against real data — the two new/changed migrations
(`add_payment_idempotency.sql`, `add_customer_delete_sales_guard.sql`) still
need to be run manually in the Supabase SQL Editor before P1-1's idempotency
check and P1-6's invoice guard actually take effect; the code paths degrade
safely (no-op the check) until then, but aren't actually protecting anything.

Both commits are local only — say the word and I'll push.
