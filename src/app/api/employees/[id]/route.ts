import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/** Deletes an employee. Server-side so manageEmployees is enforced — see the sibling POST
 *  route's comment for why this moved off a direct browser-to-Supabase call. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const { data: employee } = await supabase.from("employees").select("id, name").eq("id", id).maybeSingle();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Employee deleted: ${employee.name}`);
  return NextResponse.json({ ok: true });
}
