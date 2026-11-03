import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({ currentPassword: z.string(), newPassword: z.string().min(1).max(100) });

/**
 * Changes the "Today's Snapshot" report's password (see unlock/route.ts and
 * add_daily_snapshot_password.sql). Requires the current password, same as any password-change
 * flow, so unlocking the report once doesn't implicitly grant changing it forever after.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.viewFinancialReports) return NextResponse.json({ error: "No permission to change this" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data } = await serviceClient.from("app_settings").select("value").eq("key", "dailySnapshotPassword").maybeSingle();
  const stored = (data?.value as { password?: string } | null)?.password || "today";

  if (parsed.data.currentPassword !== stored) return NextResponse.json({ error: "Current password is wrong" }, { status: 401 });

  const { error } = await serviceClient.from("app_settings").upsert({ key: "dailySnapshotPassword", value: { password: parsed.data.newPassword } });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
