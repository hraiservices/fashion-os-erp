import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({ password: z.string() });

const DEFAULT_PASSWORD = "today";

/**
 * The only sanctioned way to check the "Today's Snapshot" report's password — see
 * add_daily_snapshot_password.sql, which blocks every authenticated client from reading the
 * dailySnapshotPassword app_settings row directly. The real access control is already
 * viewFinancialReports (checked here too); this password is a quick screen-lock for a shared
 * device, not a second permission tier — so it's deliberately not rate-limited beyond that.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.viewFinancialReports) return NextResponse.json({ error: "No permission to view this report" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter the password" }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data } = await serviceClient.from("app_settings").select("value").eq("key", "dailySnapshotPassword").maybeSingle();
  const stored = (data?.value as { password?: string } | null)?.password || DEFAULT_PASSWORD;

  if (parsed.data.password !== stored) return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
