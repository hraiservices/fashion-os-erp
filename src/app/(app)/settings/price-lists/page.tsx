"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { PriceListsSection } from "@/components/settings/price-lists-section";

export default function Page() {
  return (
    <SettingsPage title="Price Lists" description="Customer-tier product pricing — assign a list to a customer to override default selling prices on new invoices and quotations">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <PriceListsSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
