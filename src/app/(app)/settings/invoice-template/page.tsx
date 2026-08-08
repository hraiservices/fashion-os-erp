"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { InvoiceTemplateSection } from "@/components/settings/invoice-template-section";

export default function Page() {
  return (
    <SettingsPage title="Invoice Template" description="Colors, paper size, fields shown, logo, QR code, signature and bank details on invoice PDFs">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <InvoiceTemplateSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
