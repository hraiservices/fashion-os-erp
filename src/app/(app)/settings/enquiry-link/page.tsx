"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { EnquiryLinkSection } from "@/components/settings/enquiry-link-section";

export default function Page() {
  return (
    <SettingsPage title="Enquiry Link & QR" description="Let customers send an enquiry that lands straight in Leads">
      <SettingsGuard allow={({ perms }) => perms.manageTargets}>
        <EnquiryLinkSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
