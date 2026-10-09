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

  // payslips and employee_advances both have ON DELETE CASCADE on employee_id (see
  // fix_employee_delete_fk_constraints.sql — every employees(id) reference does except
  // manager_id, by design) — so unlike every other guard in this route, Postgres's own foreign
  // key would NOT raise a 23503 here and silently let the delete through, wiping the employee's
  // entire payroll/payslip history and any cash advances (including ones already deducted from a
  // finalized payslip) with no trace. Those are real financial records, not disposable cache like
  // tailor_worksheet_snapshots, so this is checked explicitly rather than left to the cascade.
  const { count: payslipCount } = await serviceClient.from("payslips").select("id", { count: "exact", head: true }).eq("employee_id", id);
  if (payslipCount) {
    return NextResponse.json(
      { error: `${employee.name} has ${payslipCount} payroll payslip(s) on record and can't be deleted — that would permanently erase their payroll history. Mark them inactive instead if they've left.` },
      { status: 409 }
    );
  }
  const { count: advanceCount } = await serviceClient.from("employee_advances").select("id", { count: "exact", head: true }).eq("employee_id", id);
  if (advanceCount) {
    return NextResponse.json(
      { error: `${employee.name} has ${advanceCount} recorded cash advance(s) and can't be deleted — that would permanently erase that record. Mark them inactive instead if they've left.` },
      { status: 409 }
    );
  }

  const { error } = await serviceClient.from("employees").delete().eq("id", id);
  if (error) {
    // 23503 = foreign_key_violation. Surfaced here (rather than only fixed at the schema level
    // with ON DELETE CASCADE/SET NULL for every known reference) so a reference nobody's added
    // cascade/set-null handling for yet fails with an explanation instead of a raw Postgres
    // error dumped straight onto the screen.
    if (error.code === "23503") {
      return NextResponse.json(
        { error: `${employee.name} still has records elsewhere in the system that reference them, so they can't be deleted yet. (${error.message})` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAction(supabase, user.email, `Employee deleted: ${employee.name}`);
  return NextResponse.json({ ok: true });
}
