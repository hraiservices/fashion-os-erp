import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServerUser } from "@/lib/auth-server";
import { mapPayslipRow, mapEmployeeRow, mapPayrollRunRow, mapEmployeeAdvanceRow } from "@/lib/types";
import { PayslipDocument } from "@/lib/pdf/payslip-document";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: payslipRow, error: payslipError } = await supabase.from("payslips").select("*").eq("id", id).maybeSingle();
  if (payslipError) return NextResponse.json({ error: payslipError.message }, { status: 500 });
  if (!payslipRow) return NextResponse.json({ error: "Payslip not found" }, { status: 404 });

  // Either full payroll access, or this is the logged-in employee's own payslip.
  const isOwnPayslip = !!user.employeeId && user.employeeId === payslipRow.employee_id;
  if (!user.perms.managePayroll && !isOwnPayslip) return NextResponse.json({ error: "No permission to view this payslip" }, { status: 403 });

  // `select("*")` on employees would now fail — `authenticated` holds SELECT only on the
  // non-credential columns (lockdown_pin_hash_columns.sql), and pin_hash is not something a
  // payslip PDF has any business loading anyway. Naming the columns keeps this on the caller's
  // own session (so RLS still applies) instead of reaching for the service role.
  const [{ data: employeeRow }, { data: runRow }, { data: advanceRows }, { data: shopSetting }, { data: templateSetting }] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, name, mobile, role, employment_type, commission_type, commission_rate, active, joined_date, notes, salary_type, salary_rate, piece_rate_eligible, location_id, manager_id, created_at, updated_at"
      )
      .eq("id", payslipRow.employee_id)
      .maybeSingle(),
    supabase.from("payroll_runs").select("*").eq("id", payslipRow.payroll_run_id).maybeSingle(),
    supabase.from("employee_advances").select("*").eq("payslip_id", id).order("date", { ascending: true }),
    supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "invoiceTemplates").maybeSingle(),
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
