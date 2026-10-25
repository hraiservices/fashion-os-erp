"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { StitchingOrderTemplateSection, GarmentTagSection } from "@/components/settings/stitching-order-template-section";
import { MobileSection } from "@/components/settings/mobile-section";

export default function Page() {
  return (
    <SettingsPage title="Stitching Order Template" description="Colors, fields, logo, QR code and signature on the customer receipt PDF and the tailor's garment tag">
      <SettingsGuard allow={({ perms }) => perms.manageDocumentTemplates}>
        <div className="space-y-4">
          <MobileSection title="Stitching order receipt PDF template" defaultOpen>
            <StitchingOrderTemplateSection />
          </MobileSection>
          <MobileSection title="Garment tag (shop-floor label)">
            <GarmentTagSection />
          </MobileSection>
        </div>
      </SettingsGuard>
    </SettingsPage>
  );
}
