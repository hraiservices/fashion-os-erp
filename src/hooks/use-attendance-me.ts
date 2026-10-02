"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface AttendanceMe {
  employee: { id: string; name: string; role: string };
  checkedInAt: string | null;
  checkedOutAt: string | null;
  hoursWorked: number | null;
}

async function fetchAttendanceMe(triedPortalLogin = false): Promise<AttendanceMe | null> {
  const res = await fetch("/api/attendance/me");
  if (res.status === 401) {
    if (!triedPortalLogin) {
      const portalRes = await fetch("/api/attendance/portal-login", { method: "POST" });
      if (portalRes.ok) return fetchAttendanceMe(true);
    }
    return null;
  }
  if (!res.ok) return null;
  return res.json();
}

/**
 * Today's check-in/out status for a portal login linked to an employee record. Called from
 * useAttendanceWidget (attendance-widget.tsx), which Topbar runs unconditionally since Topbar
 * itself is always mounted — so this fetch kicks off at page load instead of only once the
 * account dropdown opens, meaning the Check In/Out item is already resolved from cache by the
 * time someone opens the menu instead of a fresh ~2s round trip (plus, on a 401, a second serial
 * portal-login retry) visibly popping the item in after the rest of the menu is already settled.
 */
export function useAttendanceMe(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: ["attendance-me", employeeId],
    queryFn: () => fetchAttendanceMe(),
    enabled: !!employeeId,
    staleTime: 60_000,
  });
}

export function useInvalidateAttendanceMe() {
  const qc = useQueryClient();
  return (employeeId: string | null | undefined) => qc.invalidateQueries({ queryKey: ["attendance-me", employeeId] });
}
