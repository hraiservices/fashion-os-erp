"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { ShopLinksSection } from "@/components/settings/shop-links-section";

export default function Page() {
  return (
    <SettingsPage title="UPI Payments" description="The UPI ID customers pay to">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <ShopLinksSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
