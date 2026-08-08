import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { fetchPublicInvoice } from "@/lib/public-invoice";
import { InvoiceDocument } from "@/lib/pdf/invoice-document";

// @react-pdf/renderer needs Node's stream/fs APIs — not Edge-compatible.
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const data = await fetchPublicInvoice(supabase, token);
  if (!data) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const { invoice, paidTotal, balance, shopName, shopPhone, template } = data;

  const buffer = await renderToBuffer(
    <InvoiceDocument invoice={invoice} shopName={shopName} shopPhone={shopPhone} paidTotal={paidTotal} balance={balance} template={template} />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
