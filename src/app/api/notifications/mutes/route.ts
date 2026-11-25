import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { CATEGORY_LABELS, type NotificationCategory } from "@/lib/notification-alerts";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as NotificationCategory[];

/** This user's own muted categories (notification_mutes — supabase/migrations/add_notification_per_user_state.sql). */
export async function GET() {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase.from("notification_mutes").select("category").eq("user_email", user.email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ muted: (data || []).map((m) => m.category) });
}

const bodySchema = z.object({
  category: z.enum(CATEGORIES as [NotificationCategory, ...NotificationCategory[]]),
  muted: z.boolean(),
});

/** Mutes/unmutes one category for the CALLER only — never affects anyone else's bell. */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { category, muted } = parsed.data;

  const error = muted
    ? (await db.from("notification_mutes").upsert({ user_email: user.email, category }, { onConflict: "user_email,category" })).error
    : (await db.from("notification_mutes").delete().eq("user_email", user.email).eq("category", category)).error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
