import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerUser } from "@/lib/auth-server";
import { buildTailorWorksheet } from "@/lib/tailor-worksheet";
import { TailorWorksheetDocument } from "@/lib/pdf/tailor-worksheet-document";
import { istDateString } from "@/lib/ist-date";

export const runtime = "nodejs";

/** Printable, one-page-per-tailor version of the same report the on-screen page shows — calls
 *  the same buildTailorWorksheet() so the screen and the printout can never disagree, and the
 *  snapshot upsert only ever needs to happen in one place. */
export async function GET() {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const sections = await buildTailorWorksheet(supabase);
  const today = istDateString();

  const { data: shopSetting } = await supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle();
  const shop = (shopSetting?.value as { name?: string; logoDataUrl?: string | null } | null) || {};

  const buffer = await renderToBuffer(
    <TailorWorksheetDocument sections={sections} date={today} shopName={shop.name || ""} logoDataUrl={shop.logoDataUrl} />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Tailor-Worksheet-${today}.pdf"`,
    },
  });
}
