import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";
import { nextWoStatus, WO_STATUS_LABELS } from "@/lib/manufacturing";

const bodySchema = z.object({ status: z.enum(["draft", "in_progress", "qc", "completed"]) });

/** Advances draft -> in_progress -> qc only — completing a work order goes through /complete
 *  instead, since that step also moves stock and (once confirmed) finalizes a tailor payable.
 *  The target status is validated against nextWoStatus(current) server-side rather than
 *  trusted from the client, so a request can't jump stages or move backward. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageManufacturing) return NextResponse.json({ error: "No permission to manage manufacturing" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data: row } = await supabase.from("work_orders").select("wo_number, status").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

  const expected = nextWoStatus(row.status as never);
  if (parsed.data.status === "completed" || parsed.data.status !== expected) {
    return NextResponse.json({ error: "Invalid stage transition" }, { status: 409 });
  }

  const { error } = await supabase.from("work_orders").update({ status: parsed.data.status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Work order ${row.wo_number} moved to ${WO_STATUS_LABELS[parsed.data.status]}`);
  return NextResponse.json({ ok: true });
}
