"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { DocumentNumberingSection } from "@/components/settings/document-numbering-section";

export default function Page() {
  return (
    <SettingsPage title="Document Numbering" description="Control your own invoice and stitching order numbers, auto-assigned on save">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <DocumentNumberingSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
