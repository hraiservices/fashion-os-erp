import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { getClosingHistory } from "@/lib/day-book-server";
import { istDateString } from "@/lib/ist-date";

/** Cash-close results for the last 30 days, plus days with money activity that were never closed. */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.viewReports) return NextResponse.json({ error: "No permission to view reports" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  try {
    return NextResponse.json(await getClosingHistory(db, istDateString()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load history" }, { status: 500 });
  }
}
