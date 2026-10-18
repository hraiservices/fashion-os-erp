"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { LeadSequencesSection } from "@/components/settings/lead-sequences-section";

export default function Page() {
  return (
    <SettingsPage title="Follow-up Plans" description="A set cadence of follow-ups so no enquiry goes cold">
      <SettingsGuard allow={({ perms }) => perms.manageTargets}>
        <LeadSequencesSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
