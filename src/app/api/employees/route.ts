import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
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
  locationId: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const touchesSalary = fd.salaryType !== undefined || fd.salaryRate !== undefined;
  if (touchesSalary && !user.perms.managePayroll) {
    return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });
  }

  const isNew = !fd.id;
  const { data, error } = await supabase
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
      ...(fd.locationId !== undefined ? { location_id: fd.locationId } : {}),
    })
    .select("id, name, mobile, role, employment_type, commission_type, commission_rate, active, joined_date, notes, salary_type, salary_rate, location_id, manager_id, created_at, updated_at")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Save failed" }, { status: 500 });

  await logAction(supabase, user.email, isNew ? `Employee added: ${fd.name}` : `Employee updated: ${fd.name}`);
  return NextResponse.json({ employee: mapEmployeeRow({ ...data, pin_hash: null } as never) });
}
