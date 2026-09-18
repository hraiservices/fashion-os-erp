"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { StitchingOrderTemplateSection, GarmentTagSection } from "@/components/settings/stitching-order-template-section";

export default function Page() {
  return (
    <SettingsPage title="Stitching Order Template" description="Colors, fields, logo, QR code and signature on the customer receipt PDF and the tailor's garment tag">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <div className="space-y-4">
          <StitchingOrderTemplateSection />
          <GarmentTagSection />
        </div>
      </SettingsGuard>
    </SettingsPage>
  );
}
