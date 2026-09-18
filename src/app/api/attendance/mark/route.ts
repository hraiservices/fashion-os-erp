import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  status: z.enum(["present", "absent", "half_day", "leave"]),
  checkIn: z.string().nullable().optional(),
  checkOut: z.string().nullable().optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Marks/updates one employee's attendance for one day — the manual grid on
 * /employees/attendance, as opposed to the employee's own PIN check-in/out.
 *
 * This used to be a direct browser-to-Supabase upsert in useMarkAttendance, which made it the
 * single most valuable hole in the app: `employee_attendance` had the project-default
 * `USING (true)` RLS, and /api/payroll/run reads exactly these rows to compute gross pay
 * (countAttendance -> computeGrossPay). So any authenticated user — a tailor with every
 * permission false — could run this from the browser console:
 *
 *   supabase.from('employee_attendance')
 *     .upsert({ employee_id: myId, date: '2026-09-01', status: 'present' })
 *
 * ...for every day of a month and be paid for work they never did. On a `daily` salary type
 * that is a straight per-day multiplier into net pay. The manageEmployees check that gated the
 * attendance page was UI-only and never in the way of that call.
 *
 * `created_by` was also taken from the request body, so the audit trail recorded whatever the
 * caller typed — the same flaw the payroll route already fixed for itself (see "H-8" there).
 * It is derived from the session here and is no longer accepted from the client.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage attendance" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { employeeId, date, status, checkIn, checkOut, notes } = parsed.data;

  // employee_attendance is write-locked for `authenticated` (lockdown_hr_payroll_writes.sql);
  // the manageEmployees check above is what authorises this write.
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured to manage attendance (missing service role key)" }, { status: 501 });

  const { error } = await db.from("employee_attendance").upsert(
    {
      employee_id: employeeId,
      date,
      status,
      check_in: checkIn || null,
      check_out: checkOut || null,
      notes: notes || "",
      created_by: user.email,
    },
    { onConflict: "employee_id,date" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Attendance marked ${status} for ${date}`, undefined, `Employee: ${employeeId}`);
  return NextResponse.json({ ok: true });
}
