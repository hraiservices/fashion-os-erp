"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { RatesSection } from "@/components/settings/rates-section";
import { FabricUsageSection } from "@/components/settings/fabric-usage-section";

export default function Page() {
  return (
    <SettingsPage title="Rate Card" description="Default prices per garment type and lining">
      <SettingsGuard allow={({ canManageShop }) => canManageShop}>
        <div className="space-y-4">
          <RatesSection />
          <FabricUsageSection />
        </div>
      </SettingsGuard>
    </SettingsPage>
  );
}
