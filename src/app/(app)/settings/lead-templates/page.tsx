"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { LeadTemplatesSection } from "@/components/settings/lead-templates-section";

export default function Page() {
  return (
    <SettingsPage title="Lead WhatsApp Messages" description="Ready-made messages to start a WhatsApp chat with a lead">
      <SettingsGuard allow={({ perms }) => perms.manageTargets}>
        <LeadTemplatesSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
