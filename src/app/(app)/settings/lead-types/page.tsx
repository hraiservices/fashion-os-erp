"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { LeadTypesSection } from "@/components/settings/lead-types-section";

export default function Page() {
  return (
    <SettingsPage title="Lead Types" description="What a lead is for — a stitching customer, an App Sale, a referral, or anything else worth sorting separately">
      <SettingsGuard allow={({ perms }) => perms.manageTargets}>
        <LeadTypesSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
