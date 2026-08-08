"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { ShopSection } from "@/components/settings/shop-section";

export default function Page() {
  return (
    <SettingsPage title="Shop Profile" description="Your shop name and contact number, used on receipts and WhatsApp messages">
      <SettingsGuard allow={({ canManageShop }) => canManageShop}>
        <ShopSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
