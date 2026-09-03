import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapEmployeeRow } from "@/lib/types";
import { logAction } from "@/lib/logging";

/**
 * Create/update an employee. Server-side so manageEmployees is enforced (this used to be a
 * direct browser-to-Supabase upsert, so the permission was UI-only — any authenticated user,
 * including a tailor, could raise their own salary or edit any colleague's record from the
 * console). Salary fields additionally require managePayroll — a manager with manageEmployees
 * but not managePayroll can edit someone's role/contact details but not their pay.
 */
const bodySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  mobile: z.string(),
  role: z.string(),
  employmentType: z.string(),
  commissionType: z.enum(["none", "percent_of_sales", "flat_per_order"]),
  commissionRate: z.number().min(0),
  active: z.boolean(),
  joinedDate: z.string().nullable(),
  notes: z.string(),
  salaryType: z.enum(["monthly", "daily", "hourly"]).optional(),
  salaryRate: z.number().min(0).optional(),
  pieceRateEligible: z.boolean().optional(),
  locationId: z.string().nullable().optional(),
});

const EMPLOYEE_COLUMNS_WITH_SALARY =
  "id, name, mobile, role, employment_type, commission_type, commission_rate, active, joined_date, notes, salary_type, salary_rate, piece_rate_eligible, location_id, manager_id, created_at, updated_at";

/**
 * The salary-bearing employee list, for the payroll and employee screens.
 *
 * salary_type/salary_rate/piece_rate_eligible are no longer readable by `authenticated` at all
 * (lockdown_employee_salary_columns.sql), so this is the only way to get them. use-employees.ts
 * still reads the non-salary columns straight from the browser — that half needs no privilege
 * and keeps the tailor dropdown, the order form and the attendance sheet working for everyone.
 */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to view salaries" }, { status: 403 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data, error } = await serviceClient.from("employees").select(EMPLOYEE_COLUMNS_WITH_SALARY).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ employees: (data || []).map((r) => mapEmployeeRow({ ...r, pin_hash: null } as never)) });
}

export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const touchesSalary = fd.salaryType !== undefined || fd.salaryRate !== undefined || fd.pieceRateEligible !== undefined;
  if (touchesSalary && !user.perms.managePayroll) {
    return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });
  }

  // Service-role client for the write: `authenticated` no longer holds INSERT/UPDATE on
  // employees (lockdown_hr_payroll_writes.sql — it was the hole that let anyone edit their own
  // salary_rate straight from the console). The two permission checks above are the authority.
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage employees (missing service role key)" }, { status: 501 });

  const isNew = !fd.id;
  const { data, error } = await serviceClient
    .from("employees")
    .upsert({
      id: fd.id,
      name: fd.name.trim(),
      mobile: fd.mobile.trim(),
      role: fd.role.trim(),
      employment_type: fd.employmentType,
      commission_type: fd.commissionType,
      commission_rate: fd.commissionRate,
      active: fd.active,
      joined_date: fd.joinedDate || null,
      notes: fd.notes.trim(),
      ...(fd.salaryType ? { salary_type: fd.salaryType } : {}),
      ...(fd.salaryRate !== undefined ? { salary_rate: fd.salaryRate } : {}),
      ...(fd.pieceRateEligible !== undefined ? { piece_rate_eligible: fd.pieceRateEligible } : {}),
      ...(fd.locationId !== undefined ? { location_id: fd.locationId } : {}),
    })
    .select(EMPLOYEE_COLUMNS_WITH_SALARY)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Save failed" }, { status: 500 });

  await logAction(supabase, user.email, isNew ? `Employee added: ${fd.name}` : `Employee updated: ${fd.name}`);
  return NextResponse.json({ employee: mapEmployeeRow({ ...data, pin_hash: null } as never) });
}
