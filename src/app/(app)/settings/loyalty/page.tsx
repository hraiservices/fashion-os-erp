"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { LoyaltySection } from "@/components/settings/loyalty-section";

export default function Page() {
  return (
    <SettingsPage title="Loyalty" description="Points earning, redemption and tier thresholds">
      <SettingsGuard allow={({ perms }) => perms.manageLoyaltySettings}>
        <LoyaltySection />
      </SettingsGuard>
    </SettingsPage>
  );
}
