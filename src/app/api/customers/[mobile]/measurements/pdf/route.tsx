import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerUser } from "@/lib/auth-server";
import { MeasurementDocument } from "@/lib/pdf/measurement-document";
import { hydrateMeasurements } from "@/lib/measurements";
import { DEF_MF_LABELS } from "@/lib/measurements";

export const runtime = "nodejs";

/** Printable measurement card for one customer — same data as CustomerMeasurements/
 *  MeasurementView (src/components/measurements/measurement-grid.tsx), just rendered as a PDF
 *  for download/print instead of the on-screen grid. */
export async function GET(_req: Request, { params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: customerRow }, { data: fieldsSetting }, { data: shopSetting }, { data: templateSetting }] = await Promise.all([
    supabase.from("customers").select("name, mobile, measurements").eq("mobile", mobile).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "measureFields").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "invoiceTemplates").maybeSingle(),
  ]);
  if (!customerRow) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const fields = (fieldsSetting?.value as string[] | null) || [...DEF_MF_LABELS];
  const values = hydrateMeasurements(fields, customerRow.measurements as Record<string, unknown> | null);
  const shop = (shopSetting?.value as { name?: string; phone?: string; address?: string } | null) || {};
  const templates = templateSetting?.value as { templates?: { logoDataUrl?: string | null }[] } | null;
  const logoDataUrl = templates?.templates?.[0]?.logoDataUrl ?? null;

  const buffer = await renderToBuffer(
    <MeasurementDocument
      customerName={customerRow.name || ""}
      customerMobile={customerRow.mobile || ""}
      fields={fields}
      values={values}
      shopName={shop.name || ""}
      shopAddress={shop.address || ""}
      shopPhone={shop.phone || ""}
      logoDataUrl={logoDataUrl}
    />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Measurements-${(customerRow.name || "customer").replace(/\s+/g, "_")}.pdf"`,
    },
  });
}
