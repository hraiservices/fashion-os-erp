"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { AdminConsoleSection } from "@/components/settings/admin-console-section";

export default function Page() {
  return (
    <SettingsPage title="Admin Console" description="Onboarding steps, live weblinks, and deployment status — platform-owner only">
      <SettingsGuard allow={({ isSuperAdmin }) => isSuperAdmin}>
        <AdminConsoleSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
