"use client";

import { SettingsPage } from "@/components/settings/settings-page";
import { SecuritySection } from "@/components/settings/security-section";
import { DataExportSection } from "@/components/settings/data-export-section";
import { PushNotificationsSection } from "@/components/settings/push-notifications-section";

export default function Page() {
  return (
    <SettingsPage title="Account" description="Your sign-in and password">
      <div className="space-y-4">
        <SecuritySection />
        <PushNotificationsSection />
        <DataExportSection />
      </div>
    </SettingsPage>
  );
}
