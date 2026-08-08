"use client";

import { SettingsPage } from "@/components/settings/settings-page";
import { SecuritySection } from "@/components/settings/security-section";

export default function Page() {
  return (
    <SettingsPage title="Account" description="Your sign-in and password">
      <SecuritySection />
    </SettingsPage>
  );
}
