import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerUser } from "@/lib/auth-server";
import { mapSalesInvoiceRow } from "@/lib/types";
import { deriveInvoiceBalance } from "@/lib/sales";
import { InvoiceDocument } from "@/lib/pdf/invoice-document";
import { DEFAULT_INVOICE_TEMPLATES_SETTING, getDefaultTemplate, type InvoiceTemplatesSetting } from "@/lib/invoice-template";

// @react-pdf/renderer needs Node's stream/fs APIs — not Edge-compatible.
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [{ data: invoiceRow, error: invError }, { data: payments }, { data: credits }, { data: shopSetting }, { data: templateSetting }] = await Promise.all([
    supabase.from("sales_invoices").select("*").eq("id", id).maybeSingle(),
    supabase.from("sales_payments").select("amount").eq("invoice_id", id),
    supabase.from("sales_credit_notes").select("total").eq("invoice_id", id),
    supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "invoiceTemplates").maybeSingle(),
  ]);
  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });
  if (!invoiceRow) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const invoice = mapSalesInvoiceRow(invoiceRow);
  const paidTotal = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const creditsTotal = (credits || []).reduce((s, c) => s + (c.total || 0), 0);
  const balance = deriveInvoiceBalance(invoice.total, creditsTotal, paidTotal);
  const shop = (shopSetting?.value as { name?: string; phone?: string } | null) || {};
  const template = getDefaultTemplate((templateSetting?.value as InvoiceTemplatesSetting | null) || DEFAULT_INVOICE_TEMPLATES_SETTING);

  const buffer = await renderToBuffer(
    <InvoiceDocument invoice={invoice} shopName={shop.name || ""} shopPhone={shop.phone || ""} paidTotal={paidTotal} balance={balance} template={template} />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
