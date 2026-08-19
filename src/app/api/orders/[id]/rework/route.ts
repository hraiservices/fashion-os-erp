import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { mapOrderRow } from "@/lib/types";
import { fmtNow } from "@/lib/business-rules";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  flag: z.boolean(),
  reason: z.string().optional().default(""),
});

/**
 * Toggles the rework flag — tag only, never moves the order's stage. Gated on changeStage
 * (not editOrder) since a tailor noticing a defect and flagging it for rework is exactly the
 * kind of "on the shop floor" action changeStage is meant to cover.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.changeStage) return NextResponse.json({ error: "No permission to change order stage" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { flag, reason } = parsed.data;

  if (flag && !reason.trim()) {
    return NextResponse.json({ error: "A reason is required to flag an order for rework" }, { status: 400 });
  }

  const { data: row, error: fetchError } = await supabase.from("orders").select("name").eq("id", id).maybeSingle();
  if (fetchError || !row) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const userName = user.email.split("@")[0] || "user";
  const historyLine = flag
    ? `🔁 Flagged for rework — ${fmtNow()} by ${userName}: ${reason.trim()}`
    : `✅ Rework flag cleared — ${fmtNow()} by ${userName}`;

  const { data: updatedRows, error } = await supabase.rpc("set_order_rework", {
    p_order_id: id,
    p_flag: flag,
    p_reason: reason.trim(),
    p_user: user.email,
    p_history_line: historyLine,
  });
  const updatedRow = updatedRows?.[0];
  if (error || !updatedRow) return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });

  await logAction(supabase, user.email, flag ? `🔁 Order flagged for rework: ${row.name}` : `Rework flag cleared: ${row.name}`, id, reason || undefined);

  return NextResponse.json({ order: mapOrderRow(updatedRow) });
}
