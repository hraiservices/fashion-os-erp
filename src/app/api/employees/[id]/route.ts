import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
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

  const { data: linkedUser } = await supabase.from("user_roles").select("email").eq("linked_employee_id", id).maybeSingle();
  if (linkedUser) {
    return NextResponse.json(
      { error: `This employee is linked to the login for ${linkedUser.email}. Unlink it from Users & Roles first.` },
      { status: 409 }
    );
  }

  // Service-role client for the delete — `authenticated` no longer holds DELETE on employees
  // (lockdown_hr_payroll_writes.sql). The manageEmployees check above is the authority.
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage employees (missing service role key)" }, { status: 501 });

  const { error } = await serviceClient.from("employees").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Employee deleted: ${employee.name}`);
  return NextResponse.json({ ok: true });
}
