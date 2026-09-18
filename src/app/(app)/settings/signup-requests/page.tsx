"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { SignupRequestsSection } from "@/components/settings/signup-requests-section";

export default function Page() {
  return (
    <SettingsPage title="Signup Requests" description="People who asked for their own shop via fashionflow.app/signup">
      <SettingsGuard allow={({ isSuperAdmin }) => isSuperAdmin}>
        <SignupRequestsSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
