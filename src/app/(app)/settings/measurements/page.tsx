"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { MeasurementsSection } from "@/components/settings/measurements-section";

export default function Page() {
  return (
    <SettingsPage title="Measurements" description="Fields captured on every order form">
      <SettingsGuard allow={({ canManageShop }) => canManageShop}>
        <MeasurementsSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
