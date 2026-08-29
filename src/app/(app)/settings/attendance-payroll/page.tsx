"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { AttendancePayrollSection } from "@/components/settings/attendance-payroll-section";

export default function Page() {
  return (
    <SettingsPage title="Attendance & Payroll" description="Company locations, geofencing, and overtime rules for self-service check-in">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <AttendancePayrollSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
