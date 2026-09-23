import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapOrderRow, mapSalesInvoiceRow } from "@/lib/types";
import { buildCustomerTransactions, type LedgerTransaction } from "@/lib/customer-ledger";
import { deriveInvoiceBalance, invoicePaymentStatus } from "@/lib/sales";
import { CustomerStatementDocument } from "@/lib/pdf/customer-statement-document";
import { DEFAULT_STITCHING_ORDER_TEMPLATES_SETTING, getDefaultStitchingOrderTemplate, type StitchingOrderTemplatesSetting } from "@/lib/stitching-order-template";
import { istDateString } from "@/lib/ist-date";
import { fmtDate } from "@/lib/format";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";

// @react-pdf/renderer needs Node's stream/fs APIs — not Edge-compatible.
export const runtime = "nodejs";

/**
 * PDF download for the combined Customer Statement — src/app/(app)/crm/[mobile]/statement/page.tsx
 * ("Download PDF"), same customer-facing gate as the per-order receipt (/api/orders/[id]/pdf):
 * logged in only, no extra permission. Accepts the same ?type=/&from=/&to= filters the on-screen
 * page uses, so the download always matches what's currently on screen.
 */
export async function GET(req: Request, { params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const url = new URL(req.url);
  const typeFilter = (url.searchParams.get("type") || "all") as "all" | "stitching" | "retail";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";

  const [
    { data: orderRows, error: orderError },
    { data: invoiceRows, error: invoiceError },
    { data: paymentRows, error: paymentError },
    { data: creditRows, error: creditError },
    { data: shopSetting },
    { data: templateSetting },
  ] = await Promise.all([
    db.from("orders").select("*").eq("mobile", mobile),
    db.from("sales_invoices").select("*").eq("customer_mobile", mobile),
    db.from("sales_payments").select("invoice_id, amount").eq("customer_mobile", mobile),
    db.from("sales_credit_notes").select("invoice_id, total").eq("customer_mobile", mobile),
    supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "stitchingOrderTemplates").maybeSingle(),
  ]);
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 });
  if (creditError) return NextResponse.json({ error: creditError.message }, { status: 500 });

  const orders = (orderRows || []).map(mapOrderRow);
  if (orders.length === 0 && (invoiceRows || []).length === 0) {
    return NextResponse.json({ error: "No transactions found for this customer" }, { status: 404 });
  }

  const paidByInvoice = new Map<string, number>();
  (paymentRows || []).forEach((p) => paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) || 0) + p.amount));
  const creditsByInvoice = new Map<string, number>();
  (creditRows || []).forEach((c) => creditsByInvoice.set(c.invoice_id, (creditsByInvoice.get(c.invoice_id) || 0) + c.total));

  const invoices: SalesInvoiceWithBalance[] = (invoiceRows || []).map((row) => {
    const invoice = mapSalesInvoiceRow(row);
    const paidTotal = paidByInvoice.get(invoice.id) || 0;
    const creditsTotal = creditsByInvoice.get(invoice.id) || 0;
    return {
      ...invoice,
      paidTotal,
      creditsTotal,
      balance: deriveInvoiceBalance(invoice.total, creditsTotal, paidTotal),
      paymentStatus: invoicePaymentStatus(invoice.total, creditsTotal, paidTotal),
      lastPaymentDate: null,
    };
  });

  const customerName = orders[0]?.name || invoices[0]?.customerName || "";

  const allTransactions = buildCustomerTransactions(orders, invoices);
  const transactions: LedgerTransaction[] = allTransactions.filter((t) => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    return true;
  });

  const filterParts = [typeFilter === "all" ? null : typeFilter === "stitching" ? "Stitching Orders only" : "Product Sales only", from || to ? `${from ? fmtDate(from) : "Start"} to ${to ? fmtDate(to) : "Today"}` : "All time"];
  const filterLabel = filterParts.filter(Boolean).join(" · ");

  const shop = (shopSetting?.value as { name?: string; phone?: string; address?: string } | null) || {};
  const template = getDefaultStitchingOrderTemplate((templateSetting?.value as StitchingOrderTemplatesSetting | null) || DEFAULT_STITCHING_ORDER_TEMPLATES_SETTING);

  const buffer = await renderToBuffer(
    <CustomerStatementDocument
      customerName={customerName}
      customerMobile={mobile}
      filterLabel={filterLabel}
      transactions={transactions}
      shopName={shop.name || ""}
      shopPhone={shop.phone || ""}
      shopAddress={shop.address || ""}
      generatedAt={istDateString()}
      template={template}
    />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="statement-${mobile}.pdf"`,
    },
  });
}
