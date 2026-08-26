import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";
import { checkGeofence } from "@/lib/geofence";
import { DEFAULT_ATTENDANCE_SETTINGS, MAX_SHIFT_HOURS, type AttendanceSettings } from "@/lib/attendance-settings";
import { istDateString } from "@/lib/ist-date";
import { notifyAttendance } from "@/lib/logging";

const bodySchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().optional(),
  photo: z.string().min(1, "A selfie is required"),
});

export async function POST(request: Request) {
  const employeeId = await getAttendanceEmployeeId();
  if (!employeeId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Attendance is not configured" }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid check-out data" }, { status: 400 });
  const { lat, lng, accuracy, photo } = parsed.data;

  const { data: employee } = await supabase.from("employees").select("id, name, location_id, active").eq("id", employeeId).maybeSingle();
  if (!employee || !employee.active) return NextResponse.json({ error: "Employee not found or inactive" }, { status: 404 });
  if (!employee.location_id) return NextResponse.json({ error: "No shop location is assigned to you — ask your manager to set this up." }, { status: 400 });

  const { data: location } = await supabase.from("shop_locations").select("name, latitude, longitude, geofence_radius_m").eq("id", employee.location_id).maybeSingle();
  if (!location) return NextResponse.json({ error: "Your assigned shop location no longer exists — ask your manager." }, { status: 400 });

  const geo = checkGeofence(lat, lng, location.latitude, location.longitude, location.geofence_radius_m);
  if (!geo.withinGeofence) {
    return NextResponse.json(
      { error: `You appear to be ${geo.distanceM}m from ${location.name} (allowed: ${location.geofence_radius_m}m). Move closer and try again.` },
      { status: 403 }
    );
  }

  const today = istDateString();
  const { data: existing } = await supabase.from("employee_attendance").select("id, check_in_at, check_out_at").eq("employee_id", employeeId).eq("date", today).maybeSingle();
  if (!existing?.check_in_at) return NextResponse.json({ error: "You haven't checked in today" }, { status: 409 });
  if (existing.check_out_at) return NextResponse.json({ error: "You've already checked out today" }, { status: 409 });

  const nowIso = new Date().toISOString();
  const rawHours = (new Date(nowIso).getTime() - new Date(existing.check_in_at).getTime()) / 3_600_000;
  const hoursWorked = Math.round(Math.min(Math.max(rawHours, 0), MAX_SHIFT_HOURS) * 100) / 100;

  const { data: settingRow } = await supabase.from("app_settings").select("value").eq("key", "attendanceSettings").maybeSingle();
  const settings: AttendanceSettings = { ...DEFAULT_ATTENDANCE_SETTINGS, ...((settingRow?.value as Partial<AttendanceSettings>) || {}) };
  const overtimeHours = Math.round(Math.max(0, hoursWorked - settings.standardShiftHours) * 100) / 100;

  const { error } = await supabase
    .from("employee_attendance")
    .update({
      check_out_at: nowIso,
      check_out_lat: lat,
      check_out_lng: lng,
      check_out_accuracy_m: accuracy ?? null,
      check_out_photo: photo,
      check_out_within_geofence: geo.withinGeofence,
      check_out_distance_m: geo.distanceM,
      hours_worked: hoursWorked,
      overtime_hours: overtimeHours,
    })
    .eq("id", existing.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await notifyAttendance(supabase, { employeeId, employeeName: employee.name, action: "check-out", hoursWorked });

  return NextResponse.json({ ok: true, checkedOutAt: nowIso, hoursWorked, overtimeHours });
}
