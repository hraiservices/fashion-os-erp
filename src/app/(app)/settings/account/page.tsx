"use client";

import { SettingsPage } from "@/components/settings/settings-page";
import { SecuritySection } from "@/components/settings/security-section";
import { DataExportSection } from "@/components/settings/data-export-section";

export default function Page() {
  return (
    <SettingsPage title="Account" description="Your sign-in and password">
      <div className="space-y-4">
        <SecuritySection />
        <DataExportSection />
      </div>
    </SettingsPage>
  );
}
