"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { TailorsSection } from "@/components/settings/tailors-section";

export default function Page() {
  return (
    <SettingsPage title="Tailors" description="Staff you can assign orders to">
      <SettingsGuard allow={({ canManageShop }) => canManageShop}>
        <TailorsSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
