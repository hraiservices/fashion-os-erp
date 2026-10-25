"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import { SettingsPage } from "@/components/settings/settings-page";
import { ShopSection } from "@/components/settings/shop-section";
import { SecuritySection } from "@/components/settings/security-section";
import { PushNotificationsSection } from "@/components/settings/push-notifications-section";
import { WhatsAppAppChoiceSection } from "@/components/settings/whatsapp-app-choice-section";
import { AlertPrefsSection } from "@/components/settings/alert-prefs-section";
import { DataExportSection } from "@/components/settings/data-export-section";
import { ColorThemeSection } from "@/components/settings/color-theme-section";
import { ThemeModeSection } from "@/components/settings/theme-mode-section";
import { FontSection } from "@/components/settings/font-section";
import { DashboardHeaderSection } from "@/components/settings/dashboard-header-section";
import { CardHeaderBgSection } from "@/components/settings/card-header-bg-section";
import { DocumentNumberingSection } from "@/components/settings/document-numbering-section";
import { MobileSection } from "@/components/settings/mobile-section";
import { Skeleton } from "@/components/ui/skeleton";

/** Shop Profile, Account, Appearance, and Document Numbering merged onto one page — the four
 *  "how does this deployment look and identify itself" settings a shop sets up once and rarely
 *  revisits, as opposed to the day-to-day config pages (rates, loyalty, templates, etc). Each
 *  section keeps its own permission check inline (rather than redirecting the whole page away)
 *  since Account is visible to everyone while the others require more access.
 *
 *  Below `sm`, each group collapses behind its own MobileSection header — "Company Profile"
 *  starts open (the group someone arriving here is usually after), the rest start collapsed.
 *  Desktop/tablet is unchanged (every group always expanded, plain SectionLabel). */
export default function Page() {
  const { data: user, isLoading } = useCurrentUser();
  const canManageShop = !user?.restricted;
  const isAdmin = user?.role === "admin";

  if (isLoading) {
    return (
      <SettingsPage title="Personalize">
        <Skeleton className="h-64 w-full" />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Personalize" description="Company profile, your account, appearance, and document numbering — all in one place">
      <div className="space-y-4">
        {canManageShop && (
          <MobileSection title="Company Profile" defaultOpen>
            <ShopSection />
          </MobileSection>
        )}

        <MobileSection title="Account" defaultOpen={!canManageShop}>
          <SecuritySection />
          <PushNotificationsSection />
          <WhatsAppAppChoiceSection />
          <AlertPrefsSection />
          <DataExportSection />
        </MobileSection>

        {isAdmin && (
          <>
            <MobileSection title="Appearance">
              <ColorThemeSection />
              <ThemeModeSection />
              <FontSection />
              <DashboardHeaderSection />
              <CardHeaderBgSection />
            </MobileSection>

            <MobileSection title="Document Numbering">
              <DocumentNumberingSection />
            </MobileSection>
          </>
        )}
      </div>
    </SettingsPage>
  );
}
