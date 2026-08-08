"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { NavigationSection } from "@/components/settings/navigation-section";

export default function Page() {
  return (
    <SettingsPage title="Sidebar Navigation" description="Hide, reorder, and regroup any sidebar menu — applies to everyone in the shop">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <NavigationSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
