import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { buildTailorWorksheet } from "@/lib/tailor-worksheet";

/** Feeds the on-screen Daily Tailor Worksheet report page. Gated the same way the rest of
 *  /reports/* already is (route-group-level admin/manager restriction) — this data isn't
 *  separately sensitive (no money/payroll figures), so no extra permission check beyond that. */
export async function GET() {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const sections = await buildTailorWorksheet(supabase);
  return NextResponse.json({ sections });
}
