import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchAll } from "@/lib/fetch-all";

/**
 * Subsidiary-ledger-to-control-account reconciliation for stitching orders.
 *
 * Unlike invoices and bills — whose balances are derived live from their payment tables —
 * `orders.advance` and `orders.balance` are STORED columns, and every receivables report trusts
 * them (see src/lib/balances.ts). They are maintained correctly going forward: record_order_payment
 * and delete_order_payment update them inside a row lock alongside the order_payments insert.
 *
 * What was missing is any control proving they still AGREE for rows written before that ledger
 * existed. The migration history records both failure modes directly: older record_order_payment
 * overloads moved `advance` with no ledger row behind it (fix_payment_ledger_p0_bugs.sql), and
 * overpaid orders with advance > total are confirmed to exist in production
 * (fix_edit_order_numeric_and_overpay_guard.sql). Drift from either is currently invisible and
 * would silently misstate receivables.
 *
 * This route recomputes the control total from the subsidiary ledger and reports every order
 * where the two disagree. It is read-only — it reports drift, it never "corrects" a balance,
 * because which side is right is a judgement call about real money that belongs to a human.
 */

interface OrderRow {
  id: string;
  name: string;
  mobile: string;
  total: number;
  advance: number;
  balance: number;
  status: string;
  in_date: string;
}

interface PaymentRow {
  order_id: string;
  amount: number;
  pt_discount: number | null;
  discount: number | null;
}

/** Money compares at paise, not float-exact — a stored 1234.56 and a summed 1234.5599999 are the
 *  same rupee figure, and flagging that as drift would bury the real breaks in noise. */
const TOLERANCE = 0.01;

export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.viewReports) return NextResponse.json({ error: "No permission to view reports" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const [orders, payments] = await Promise.all([
    fetchAll<OrderRow>((from, to) => db.from("orders").select("id, name, mobile, total, advance, balance, status, in_date").range(from, to)),
    fetchAll<PaymentRow>((from, to) => db.from("order_payments").select("order_id, amount, pt_discount, discount").range(from, to)),
  ]);

  // pt_discount (loyalty points redeemed) and discount (a manual write-off, see
  // add_order_payment_discount.sql) both settle balance exactly as cash does, and
  // delete_order_payment subtracts them from `advance` alongside the amount, so the control
  // total has to include both or every redemption/write-off would read as drift.
  const ledgerByOrder = new Map<string, number>();
  for (const p of payments) {
    ledgerByOrder.set(p.order_id, (ledgerByOrder.get(p.order_id) || 0) + (p.amount || 0) + (p.pt_discount || 0) + (p.discount || 0));
  }

  const breaks = orders
    .map((o) => {
      const ledgerAdvance = ledgerByOrder.get(o.id) || 0;
      const storedAdvance = o.advance || 0;
      const advanceDrift = Math.round((storedAdvance - ledgerAdvance) * 100) / 100;
      // The balance identity the reports depend on, floored at 0 exactly as the RPCs floor it.
      const expectedBalance = Math.max(0, Math.round(((o.total || 0) - storedAdvance) * 100) / 100);
      const balanceDrift = Math.round(((o.balance || 0) - expectedBalance) * 100) / 100;
      return {
        orderId: o.id,
        customerName: o.name,
        mobile: o.mobile,
        inDate: o.in_date,
        status: o.status,
        total: o.total || 0,
        storedAdvance,
        ledgerAdvance,
        advanceDrift,
        storedBalance: o.balance || 0,
        expectedBalance,
        balanceDrift,
        overpaid: storedAdvance - (o.total || 0) > TOLERANCE,
      };
    })
    .filter((r) => Math.abs(r.advanceDrift) > TOLERANCE || Math.abs(r.balanceDrift) > TOLERANCE || r.overpaid)
    .sort((a, b) => Math.abs(b.advanceDrift) + Math.abs(b.balanceDrift) - (Math.abs(a.advanceDrift) + Math.abs(a.balanceDrift)));

  return NextResponse.json({
    checkedOrders: orders.length,
    checkedPayments: payments.length,
    breakCount: breaks.length,
    totalAdvanceDrift: Math.round(breaks.reduce((s, b) => s + b.advanceDrift, 0) * 100) / 100,
    totalBalanceDrift: Math.round(breaks.reduce((s, b) => s + b.balanceDrift, 0) * 100) / 100,
    breaks,
  });
}
