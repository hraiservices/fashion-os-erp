import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Marks one notification read for the CALLER only (notification_reads — see
 * supabase/migrations/add_notification_per_user_state.sql). Replaces the old
 * `update({ read: true })` on admin_notifications itself, which marked it read for every user,
 * not just whoever clicked dismiss.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notificationId = Number(id);
  if (!Number.isFinite(notificationId)) return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });

  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { error } = await db.from("notification_reads").upsert({ notification_id: notificationId, user_email: user.email }, { onConflict: "notification_id,user_email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
