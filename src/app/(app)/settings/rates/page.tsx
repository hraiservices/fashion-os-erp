"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { RatesSection } from "@/components/settings/rates-section";

export default function Page() {
  return (
    <SettingsPage title="Rate Card" description="Default prices per garment type and lining">
      <SettingsGuard allow={({ canManageShop }) => canManageShop}>
        <RatesSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
