"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapAttendanceRow, type AttendanceStatus } from "@/lib/types";

async function fetchAttendanceForDate(date: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("employee_attendance").select("*").eq("date", date);
  if (error) throw error;
  return (data || []).map(mapAttendanceRow);
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
  return (data || []).map(mapAttendanceRow);
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
  return (data || []).map(mapAttendanceRow);
}

/** Every attendance record in a date range, across all employees — feeds the Attendance Summary report. */
export function useAttendanceInRange(from: string, to: string) {
  return useQuery({
    queryKey: ["attendance", "range", from, to],
    queryFn: () => fetchAttendanceInRange(from, to),
    enabled: !!from && !!to,
  });
}

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
 */
export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      employeeId,
      date,
      status,
      checkIn,
      checkOut,
      notes,
    }: {
      employeeId: string;
      date: string;
      status: AttendanceStatus;
      checkIn?: string | null;
      checkOut?: string | null;
      notes?: string;
      userEmail?: string;
    }) => {
      const res = await fetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date, status, checkIn, checkOut, notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to mark attendance");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}
