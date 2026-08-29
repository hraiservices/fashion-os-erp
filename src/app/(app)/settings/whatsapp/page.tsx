"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { WhatsAppSalesSection } from "@/components/settings/whatsapp-sales-section";
import { RecommendationWhatsAppSection } from "@/components/settings/recommendation-whatsapp-section";
import { ProactiveWhatsAppSection } from "@/components/settings/proactive-whatsapp-section";

/** Every WhatsApp-related setting in one place — sales invoice message wording, Cloud API
 *  credentials, product recommendation sends, the order-status concierge, and the two proactive
 *  (daily briefing / ready-for-pickup) template sends. Previously split across the old
 *  /settings/whatsapp-sales page and a section bolted onto /settings/copilot. */
export default function Page() {
  return (
    <SettingsPage title="WhatsApp" description="Message templates, Cloud API credentials, and every automated WhatsApp send in one place">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <div className="space-y-5">
          <WhatsAppSalesSection />
          <RecommendationWhatsAppSection />
          <ProactiveWhatsAppSection />
        </div>
      </SettingsGuard>
    </SettingsPage>
  );
}
