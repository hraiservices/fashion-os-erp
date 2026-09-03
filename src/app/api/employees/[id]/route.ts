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

  // Service-role client for the reads as well as the delete: `authenticated` no longer holds
  // DELETE on employees (lockdown_hr_payroll_writes.sql), and after lockdown_reads_per_row.sql
  // it can only read its OWN user_roles row unless it holds manageUsers — so the linked-login
  // check below would come back empty for a manager and let the delete through against an
  // employee that still has a login. The manageEmployees check above is the authority.
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage employees (missing service role key)" }, { status: 501 });

  const { data: employee } = await serviceClient.from("employees").select("id, name").eq("id", id).maybeSingle();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const { data: linkedUser } = await serviceClient.from("user_roles").select("email").eq("linked_employee_id", id).maybeSingle();
  if (linkedUser) {
    return NextResponse.json(
      { error: `This employee is linked to the login for ${linkedUser.email}. Unlink it from Users & Roles first.` },
      { status: 409 }
    );
  }

  const { error } = await serviceClient.from("employees").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Employee deleted: ${employee.name}`);
  return NextResponse.json({ ok: true });
}
