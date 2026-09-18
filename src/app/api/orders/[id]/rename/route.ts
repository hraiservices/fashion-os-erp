import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapOrderRow } from "@/lib/types";
import { isValidManualOrderNumber } from "@/lib/business-rules";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({ newId: z.string().min(1) });

/**
 * Renames an order's id/number after creation — gated on deleteOrder, the same "this is a
 * structural, not routine, change" bar as deleting an order, since the id is the order's real
 * primary key and every reference to it (payments, expenses, activity log, notifications,
 * referral coupons) has to be repointed atomically, not just this row updated. Routed through
 * rename_order_id() rather than a plain UPDATE for exactly that reason — see
 * add_rename_order_id_function.sql.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.deleteOrder) return NextResponse.json({ error: "No permission to change an order's number" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
  const newId = parsed.data.newId.trim();

  if (!isValidManualOrderNumber(newId)) {
    return NextResponse.json(
      { error: "Order number can only contain letters, numbers, dots, dashes and underscores (no spaces or slashes)." },
      { status: 400 }
    );
  }

  const { data: rows, error } = await db.rpc("rename_order_id", { p_old_id: id, p_new_id: newId });
  const row = rows?.[0];
  if (error || !row) {
    const status = error?.message?.includes("not found") ? 404 : error?.message?.includes("already in use") ? 409 : 400;
    return NextResponse.json({ error: error?.message || "Rename failed" }, { status });
  }

  await logAction(supabase, user.email, `✏️ Order number changed: ${id} → ${newId}`, newId);

  return NextResponse.json({ order: mapOrderRow(row) });
}
