import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/** Deletes an advance. Server-side so managePayroll is enforced — this used to be a direct
 *  browser-to-Supabase delete with no permission check. Advances already linked to a finalized
 *  payslip (payslip_id set) probably shouldn't be deleted, but that guard doesn't exist in the
 *  original client-side version either — preserving existing behavior, not introducing a new gap. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });

  const { error } = await supabase.from("employee_advances").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Advance deleted: ${id}`);
  return NextResponse.json({ ok: true });
}
