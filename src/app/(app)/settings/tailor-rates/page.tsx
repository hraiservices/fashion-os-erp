"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { TailorRatesSection } from "@/components/settings/tailor-rates-section";

export default function Page() {
  return (
    <SettingsPage title="Tailor Payable Rates" description="What each tailor earns per garment — payroll-sensitive, admin-only">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <TailorRatesSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
