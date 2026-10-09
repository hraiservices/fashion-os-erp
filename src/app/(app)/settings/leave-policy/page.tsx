"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { LeavePolicySection } from "@/components/settings/leave-policy-section";

export default function Page() {
  return (
    <SettingsPage title="Leave Policy" description="Leave types, annual entitlement, and the company holiday calendar">
      <SettingsGuard allow={({ perms }) => perms.manageEmployees}>
        <LeavePolicySection />
      </SettingsGuard>
    </SettingsPage>
  );
}
