import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { getAttendanceEmployeeId } from "@/lib/attendance-session-server";
import { checkGeofence } from "@/lib/geofence";
import { istDateString } from "@/lib/ist-date";
import { notifyAttendance } from "@/lib/logging";
import { MAX_SHIFT_HOURS } from "@/lib/attendance-settings";

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
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid check-in data" }, { status: 400 });
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
  const nowIso = new Date().toISOString();

  // An overnight shift (checked in before midnight IST, not yet checked out) lives on
  // YESTERDAY's row — checking `date = today` alone missed it, letting a second check-in
  // create a brand-new row for today while yesterday's stayed open forever (check_in_at set,
  // check_out_at null, hours never recorded).
  const { data: openShift } = await supabase
    .from("employee_attendance")
    .select("id, date, check_in_at")
    .eq("employee_id", employeeId)
    .not("check_in_at", "is", null)
    .is("check_out_at", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openShift) {
    if (openShift.date === today) {
      return NextResponse.json({ error: "You've already checked in today" }, { status: 409 });
    }
    // A stale open shift from a PRIOR day (forgot to check out) must not block today's
    // check-in indefinitely — auto-close it at end-of-day so it stops looking "open" and the
    // employee can carry on, instead of being stuck until someone manually fixes the old row.
    const shiftEndIso = new Date(`${openShift.date}T23:59:59+05:30`).toISOString();
    const rawHours = (new Date(shiftEndIso).getTime() - new Date(openShift.check_in_at!).getTime()) / 3_600_000;
    const hoursWorked = Math.round(Math.min(Math.max(rawHours, 0), MAX_SHIFT_HOURS) * 100) / 100;
    await supabase
      .from("employee_attendance")
      .update({ check_out_at: shiftEndIso, hours_worked: hoursWorked, notes: "Auto-closed: no check-out recorded before the next check-in." })
      .eq("id", openShift.id);
  }

  const { data: existing } = await supabase.from("employee_attendance").select("id, check_in_at").eq("employee_id", employeeId).eq("date", today).maybeSingle();

  const { error } = await supabase.from("employee_attendance").upsert(
    {
      id: existing?.id,
      employee_id: employeeId,
      date: today,
      status: "present",
      source: "self_service",
      check_in_at: nowIso,
      check_in_lat: lat,
      check_in_lng: lng,
      check_in_accuracy_m: accuracy ?? null,
      check_in_photo: photo,
      check_in_within_geofence: geo.withinGeofence,
      check_in_distance_m: geo.distanceM,
    },
    { onConflict: "employee_id,date" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await notifyAttendance(supabase, { employeeId, employeeName: employee.name, action: "check-in" });

  return NextResponse.json({ ok: true, checkedInAt: nowIso });
}
