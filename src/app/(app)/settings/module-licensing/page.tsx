"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { ModuleLicensingSection } from "@/components/settings/module-licensing-section";

export default function Page() {
  return (
    <SettingsPage title="Module Licensing" description="Decide which modules, reports, and dashboard widgets exist in this deployment — platform-owner only">
      <SettingsGuard allow={({ isSuperAdmin }) => isSuperAdmin}>
        <ModuleLicensingSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
