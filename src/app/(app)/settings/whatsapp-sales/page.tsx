"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { WhatsAppSalesSection } from "@/components/settings/whatsapp-sales-section";
import { RecommendationWhatsAppSection } from "@/components/settings/recommendation-whatsapp-section";

export default function Page() {
  return (
    <SettingsPage title="WhatsApp Templates" description="Customize the messages sent to customers for sales invoices">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <div className="space-y-5">
          <WhatsAppSalesSection />
          <RecommendationWhatsAppSection />
        </div>
      </SettingsGuard>
    </SettingsPage>
  );
}
