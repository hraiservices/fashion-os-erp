import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapPayslipRow, mapEmployeeRow, mapPayrollRunRow, mapEmployeeAdvanceRow } from "@/lib/types";
import { PayslipDocument } from "@/lib/pdf/payslip-document";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Service-role client throughout, with the permission check below as the sole authority.
  // payroll_runs is gated on managePayroll outright and the salary columns are not readable by
  // `authenticated` at all (lockdown_reads_whole_table.sql / lockdown_employee_salary_columns.sql),
  // so an employee pulling their OWN payslip PDF — which this route explicitly allows — cannot
  // load the pay period or the pay basis on their own session.
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data: payslipRow, error: payslipError } = await db.from("payslips").select("*").eq("id", id).maybeSingle();
  if (payslipError) return NextResponse.json({ error: payslipError.message }, { status: 500 });
  if (!payslipRow) return NextResponse.json({ error: "Payslip not found" }, { status: 404 });

  // Either full payroll access, or this is the logged-in employee's own payslip.
  const isOwnPayslip = !!user.employeeId && user.employeeId === payslipRow.employee_id;
  if (!user.perms.managePayroll && !isOwnPayslip) return NextResponse.json({ error: "No permission to view this payslip" }, { status: 403 });

  // Columns are still named explicitly rather than `select("*")`: pin_hash is not something a
  // payslip PDF has any business loading, service role or not.
  const [{ data: employeeRow }, { data: runRow }, { data: advanceRows }, { data: shopSetting }, { data: templateSetting }] = await Promise.all([
    db
      .from("employees")
      .select(
        "id, name, mobile, role, employment_type, commission_type, commission_rate, active, joined_date, notes, salary_type, salary_rate, piece_rate_eligible, location_id, manager_id, created_at, updated_at"
      )
      .eq("id", payslipRow.employee_id)
      .maybeSingle(),
    db.from("payroll_runs").select("*").eq("id", payslipRow.payroll_run_id).maybeSingle(),
    db.from("employee_advances").select("*").eq("payslip_id", id).order("date", { ascending: true }),
    db.from("app_settings").select("value").eq("key", "shop").maybeSingle(),
    db.from("app_settings").select("value").eq("key", "invoiceTemplates").maybeSingle(),
  ]);
  if (!employeeRow || !runRow) return NextResponse.json({ error: "Payslip's employee or payroll run not found" }, { status: 404 });

  const payslip = mapPayslipRow(payslipRow);
  // The credential columns aren't selected above and aren't used by the document — filled in
  // here only to satisfy the EmployeeRow shape, same as use-employees.ts does client-side.
  const employee = mapEmployeeRow({ ...employeeRow, pin_hash: null, failed_pin_attempts: 0, pin_locked_until: null });
  const run = mapPayrollRunRow(runRow);
  const advances = (advanceRows || []).map(mapEmployeeAdvanceRow);
  const shop = (shopSetting?.value as { name?: string; phone?: string; address?: string } | null) || {};
  // Reuses the invoice template's logo for letterhead consistency, per the "your shop
  // letterhead" decision — there's no separate logo concept for payslips.
  const templates = templateSetting?.value as { templates?: { logoDataUrl?: string | null }[]; defaultId?: string } | null;
  const logoDataUrl = templates?.templates?.[0]?.logoDataUrl ?? null;

  const buffer = await renderToBuffer(
    <PayslipDocument
      payslip={payslip}
      employee={employee}
      run={run}
      advances={advances}
      shopName={shop.name || ""}
      shopAddress={shop.address || ""}
      shopPhone={shop.phone || ""}
      logoDataUrl={logoDataUrl}
    />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Payslip-${employee.name.replace(/\s+/g, "_")}-${run.periodStart}.pdf"`,
    },
  });
}
