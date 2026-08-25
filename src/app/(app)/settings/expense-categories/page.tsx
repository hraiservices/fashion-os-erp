"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { ExpenseCategoriesSection } from "@/components/settings/expense-categories-section";

export default function Page() {
  return (
    <SettingsPage title="Stitching Expense Categories" description="Lining, thread, buttons, and other per-order production costs">
      <SettingsGuard allow={({ canManageShop }) => canManageShop}>
        <ExpenseCategoriesSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
