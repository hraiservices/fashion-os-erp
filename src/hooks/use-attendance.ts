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

/** Marks (or updates) one employee's attendance for a given day — upsert on the (employee_id, date) unique constraint. */
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
      userEmail,
    }: {
      employeeId: string;
      date: string;
      status: AttendanceStatus;
      checkIn?: string | null;
      checkOut?: string | null;
      notes?: string;
      userEmail?: string;
    }) => {
      const supabase = createClient();
      const { error } = await supabase.from("employee_attendance").upsert(
        {
          employee_id: employeeId,
          date,
          status,
          check_in: checkIn || null,
          check_out: checkOut || null,
          notes: notes || "",
          created_by: userEmail || null,
        },
        { onConflict: "employee_id,date" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}
