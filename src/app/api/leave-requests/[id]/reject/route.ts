import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapLeaveRequestRow } from "@/lib/types";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({ reason: z.string().min(1, "A rejection reason is required") });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data, error } = await db
    .from("leave_requests")
    .update({ status: "rejected", decided_by: user.email, decided_at: new Date().toISOString(), rejection_reason: parsed.data.reason })
    .eq("id", id)
    .eq("status", "pending") // only a still-pending request can be rejected
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Leave request not found, or is no longer pending" }, { status: 409 });

  await logAction(supabase, user.email, `Leave request rejected`, null, parsed.data.reason);
  return NextResponse.json({ request: mapLeaveRequestRow(data) });
}
