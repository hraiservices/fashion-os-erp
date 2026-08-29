"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import { SettingsPage } from "@/components/settings/settings-page";
import { ShopSection } from "@/components/settings/shop-section";
import { SecuritySection } from "@/components/settings/security-section";
import { PushNotificationsSection } from "@/components/settings/push-notifications-section";
import { DataExportSection } from "@/components/settings/data-export-section";
import { ColorThemeSection } from "@/components/settings/color-theme-section";
import { FontSection } from "@/components/settings/font-section";
import { DashboardHeaderSection } from "@/components/settings/dashboard-header-section";
import { DocumentNumberingSection } from "@/components/settings/document-numbering-section";
import { Skeleton } from "@/components/ui/skeleton";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pt-0">{children}</p>;
}

/** Shop Profile, Account, Appearance, and Document Numbering merged onto one page — the four
 *  "how does this deployment look and identify itself" settings a shop sets up once and rarely
 *  revisits, as opposed to the day-to-day config pages (rates, loyalty, templates, etc). Each
 *  section keeps its own permission check inline (rather than redirecting the whole page away)
 *  since Account is visible to everyone while the others require more access. */
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
    <SettingsPage title="Personalize" description="Shop profile, your account, appearance, and document numbering — all in one place">
      <div className="space-y-4">
        {canManageShop && (
          <>
            <SectionLabel>Shop Profile</SectionLabel>
            <ShopSection />
          </>
        )}

        <SectionLabel>Account</SectionLabel>
        <SecuritySection />
        <PushNotificationsSection />
        <DataExportSection />

        {isAdmin && (
          <>
            <SectionLabel>Appearance</SectionLabel>
            <ColorThemeSection />
            <FontSection />
            <DashboardHeaderSection />

            <SectionLabel>Document Numbering</SectionLabel>
            <DocumentNumberingSection />
          </>
        )}
      </div>
    </SettingsPage>
  );
}
