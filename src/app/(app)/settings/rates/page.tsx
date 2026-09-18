"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { RatesSection } from "@/components/settings/rates-section";
import { TailorRatesSection } from "@/components/settings/tailor-rates-section";
import { FabricUsageSection } from "@/components/settings/fabric-usage-section";

/** Rate Card — merges what used to be two separate pages (Rate Card and, under Employees,
 *  Tailor Payable Rates) into one, since they're two sides of the exact same garment-type list
 *  and were confusing to keep in sync across two screens. The customer pricing section is
 *  visible to any shop-management user (matches the old Rate Card page's access); the tailor
 *  payable section — compensation data — only renders for users with the payroll permission,
 *  same effective access as the old Tailor Payable Rates page, just one page instead of two. */
export default function Page() {
  const { data: user } = useCurrentUser();

  return (
    <SettingsPage title="Rate Card" description="What you charge customers, and what tailors earn — per garment type, by lining tier, plus alterations">
      <SettingsGuard allow={({ canManageShop }) => canManageShop}>
        <div className="space-y-4">
          <RatesSection />
          {user?.perms.managePayroll && <TailorRatesSection />}
          <FabricUsageSection />
        </div>
      </SettingsGuard>
    </SettingsPage>
  );
}
