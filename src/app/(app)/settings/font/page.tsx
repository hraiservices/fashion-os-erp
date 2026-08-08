"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { FontSection } from "@/components/settings/font-section";
import { ColorThemeSection } from "@/components/settings/color-theme-section";
import { DashboardHeaderSection } from "@/components/settings/dashboard-header-section";

export default function Page() {
  return (
    <SettingsPage title="Appearance" description="Color theme, font family, weight and size across the whole app">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <div className="space-y-4">
          <ColorThemeSection />
          <FontSection />
          <DashboardHeaderSection />
        </div>
      </SettingsGuard>
    </SettingsPage>
  );
}
