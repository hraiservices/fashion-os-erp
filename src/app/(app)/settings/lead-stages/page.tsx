"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { LeadStagesSection } from "@/components/settings/lead-stages-section";

export default function Page() {
  return (
    <SettingsPage title="Lead Stage Names" description="Rename the stages leads move through in Targets">
      <SettingsGuard allow={({ perms }) => perms.manageTargets}>
        <LeadStagesSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
