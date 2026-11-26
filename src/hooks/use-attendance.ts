"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { mapAttendanceRow, type Attendance, type AttendanceStatus } from "@/lib/types";
import { ATTENDANCE_MEDIA_BUCKET, resolveSignedMediaUrls } from "@/lib/supabase/media-resolve";

/** checkInPhoto/checkOutPhoto may be a Storage object path since the employee-media Storage
 *  migration (see src/lib/supabase/attendance-media-storage.ts), alongside legacy base64
 *  data: URLs — resolve to displayable URLs here, once, so every consumer of these three fetch
 *  functions gets an already-displayable value. Safe to resolve permanently (unlike orders'
 *  images/products' imageDataUrl): nothing ever re-submits a previously-fetched photo back to
 *  the server — check-in/out always sends a fresh capture, and /api/attendance/mark never
 *  touches these columns. */
async function resolveAttendancePhotos(supabase: SupabaseClient, rows: Attendance[]): Promise<Attendance[]> {
  const paths = rows.flatMap((r) => [r.checkInPhoto, r.checkOutPhoto]);
  const resolved = await resolveSignedMediaUrls(supabase, ATTENDANCE_MEDIA_BUCKET, paths);
  return rows.map((r, i) => ({ ...r, checkInPhoto: resolved[i * 2], checkOutPhoto: resolved[i * 2 + 1] }));
}

async function fetchAttendanceForDate(date: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("employee_attendance").select("*").eq("date", date);
  if (error) throw error;
  return resolveAttendancePhotos(supabase, (data || []).map(mapAttendanceRow));
}

export function useAttendanceForDate(date: string) {
  return useQuery({
    queryKey: ["attendance", "date", date],
    queryFn: () => fetchAttendanceForDate(date),
    enabled: !!date,
  });
}

async function fetchAttendanceForEmployee(employeeId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("employee_attendance")
    .select("*")
    .eq("employee_id", employeeId)
    .order("date", { ascending: false })
    .limit(90);
  if (error) throw error;
  return resolveAttendancePhotos(supabase, (data || []).map(mapAttendanceRow));
}

export function useAttendanceForEmployee(employeeId: string) {
  return useQuery({
    queryKey: ["attendance", "employee", employeeId],
    queryFn: () => fetchAttendanceForEmployee(employeeId),
    enabled: !!employeeId,
  });
}

async function fetchAttendanceInRange(from: string, to: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("employee_attendance").select("*").gte("date", from).lte("date", to);
  if (error) throw error;
  return resolveAttendancePhotos(supabase, (data || []).map(mapAttendanceRow));
}

/** Every attendance record in a date range, across all employees — feeds the Attendance Summary report. */
export function useAttendanceInRange(from: string, to: string) {
  return useQuery({
    queryKey: ["attendance", "range", from, to],
    queryFn: () => fetchAttendanceInRange(from, to),
    enabled: !!from && !!to,
  });
}

type MarkAttendanceVars = {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  checkIn?: string | null;
  checkOut?: string | null;
  notes?: string;
  userEmail?: string;
};

/**
 * Marks (or updates) one employee's attendance for a given day.
 *
 * Routed through POST /api/attendance/mark rather than upserting employee_attendance straight
 * from the browser: these rows are what payroll multiplies into gross pay, so the write needs a
 * real manageEmployees check on the server (the attendance page's own check was UI-only), and
 * `created_by` has to come from the session instead of the request — see that route's comment.
 *
 * `userEmail` is still accepted so existing callers don't have to change, but it is no longer
 * sent anywhere: the server records the actor from the session cookie.
 *
 * Optimistic: the attendance grid used to sit dimmed and unclickable for the whole server
 * round-trip (auth check + two DB reads + the write itself) before a status pill updated at
 * all — reported as a ~1.5s lag per click. `onMutate` below writes the new status into the
 * ["attendance","date",date] cache, and into any open ["attendance","range",from,to] cache whose
 * window covers that date (the month grid reads via the range query, not the date query), so the
 * pill highlights on click wherever it's being viewed; `onError` rolls both back and the caller
 * shows a toast; `onSettled` refetches to reconcile with whatever the server actually persisted
 * (server-computed fields like hoursWorked, or a rejected write).
 */
function patchAttendanceList(list: Attendance[] | undefined, vars: MarkAttendanceVars): Attendance[] {
  const next = list ? [...list] : [];
  const idx = next.findIndex((a) => a.employeeId === vars.employeeId && a.date === vars.date);
  if (idx >= 0) {
    next[idx] = { ...next[idx], status: vars.status, checkIn: vars.checkIn ?? next[idx].checkIn, checkOut: vars.checkOut ?? next[idx].checkOut, notes: vars.notes ?? next[idx].notes };
  } else {
    // No row for this employee/day yet — a minimal manual row, good enough to render the
    // selected pill until onSettled's refetch replaces it with the server's real row.
    next.push({
      id: `optimistic-${vars.employeeId}-${vars.date}`,
      employeeId: vars.employeeId,
      date: vars.date,
      status: vars.status,
      checkIn: vars.checkIn ?? null,
      checkOut: vars.checkOut ?? null,
      notes: vars.notes ?? "",
      createdAt: new Date().toISOString(),
      source: "manual",
      checkInAt: null,
      checkOutAt: null,
      checkInLat: null,
      checkInLng: null,
      checkInAccuracyM: null,
      checkOutLat: null,
      checkOutLng: null,
      checkOutAccuracyM: null,
      checkInPhoto: null,
      checkOutPhoto: null,
      checkInWithinGeofence: null,
      checkOutWithinGeofence: null,
      checkInDistanceM: null,
      checkOutDistanceM: null,
      hoursWorked: null,
      overtimeHours: 0,
      workNotes: "",
    });
  }
  return next;
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, date, status, checkIn, checkOut, notes }: MarkAttendanceVars) => {
      const res = await fetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date, status, checkIn, checkOut, notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to mark attendance");
    },
    onMutate: async (vars: MarkAttendanceVars) => {
      const dateKey = ["attendance", "date", vars.date] as const;
      await qc.cancelQueries({ queryKey: dateKey });
      const previousDate = qc.getQueryData<Attendance[]>(dateKey);
      qc.setQueryData<Attendance[]>(dateKey, (old) => patchAttendanceList(old, vars));

      // Any currently-cached range query whose [from,to] window contains this date — e.g. the
      // month grid's ["attendance","range",from,to] — needs the same patch, or it keeps showing
      // the old pill until onSettled's invalidate+refetch round-trips.
      const rangeQueries = qc.getQueryCache().findAll({
        predicate: (q) => q.queryKey[0] === "attendance" && q.queryKey[1] === "range" && (q.queryKey[2] as string) <= vars.date && (q.queryKey[3] as string) >= vars.date,
      });
      await Promise.all(rangeQueries.map((q) => qc.cancelQueries({ queryKey: q.queryKey })));
      const previousRanges = rangeQueries.map((q) => ({ queryKey: q.queryKey, data: qc.getQueryData<Attendance[]>(q.queryKey) }));
      for (const q of rangeQueries) {
        qc.setQueryData<Attendance[]>(q.queryKey, (old) => patchAttendanceList(old, vars));
      }

      return { dateKey, previousDate, previousRanges };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      qc.setQueryData(context.dateKey, context.previousDate);
      for (const { queryKey, data } of context.previousRanges) qc.setQueryData(queryKey, data);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["attendance", "date", vars.date] });
      qc.invalidateQueries({ queryKey: ["attendance", "employee", vars.employeeId] });
      qc.invalidateQueries({ queryKey: ["attendance", "range"] });
    },
  });
}
