"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { WhatsAppSalesSection } from "@/components/settings/whatsapp-sales-section";
import { WhatsAppStitchingSection } from "@/components/settings/whatsapp-stitching-section";
import { RecommendationWhatsAppSection } from "@/components/settings/recommendation-whatsapp-section";
import { ProactiveWhatsAppSection } from "@/components/settings/proactive-whatsapp-section";
import { WhatsAppSendLogSection } from "@/components/settings/whatsapp-send-log-section";
import { MobileSection } from "@/components/settings/mobile-section";

/** Every WhatsApp-related setting in one place — sales invoice message wording, Cloud API
 *  credentials, product recommendation sends, the order-status concierge, and the two proactive
 *  (daily briefing / ready-for-pickup) template sends. Previously split across the old
 *  /settings/whatsapp-sales page and a section bolted onto /settings/copilot.
 *
 *  Below `sm`, each of the five sections collapses behind its own MobileSection header — "Sales
 *  WhatsApp templates" starts open since it's the one most visits are about, the rest start
 *  collapsed. Desktop/tablet is unchanged (every section always expanded). */
export default function Page() {
  return (
    <SettingsPage title="WhatsApp" description="Message templates, Cloud API credentials, and every automated WhatsApp send in one place">
      <SettingsGuard allow={({ perms }) => perms.manageWhatsappSettings}>
        <div className="space-y-5">
          <MobileSection title="Sales WhatsApp templates" defaultOpen>
            <WhatsAppSalesSection />
          </MobileSection>
          <MobileSection title="Stitching order WhatsApp templates">
            <WhatsAppStitchingSection />
          </MobileSection>
          <MobileSection title="Product recommendation messages">
            <RecommendationWhatsAppSection />
          </MobileSection>
          <MobileSection title="Proactive sends">
            <ProactiveWhatsAppSection />
          </MobileSection>
          <MobileSection title="Send log">
            <WhatsAppSendLogSection />
          </MobileSection>
        </div>
      </SettingsGuard>
    </SettingsPage>
  );
}
