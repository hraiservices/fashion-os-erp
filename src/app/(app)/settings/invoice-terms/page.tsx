"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { InvoiceTermsSection } from "@/components/settings/invoice-terms-section";

export default function Page() {
  return (
    <SettingsPage title="Invoice Terms" description="Default Terms & Conditions text shown on new sales invoices">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <InvoiceTermsSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
