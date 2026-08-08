"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { UsersSection } from "@/components/settings/users-section";

export default function Page() {
  return (
    <SettingsPage title="Users \& Roles" description="Who can access the app and what they can do">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <UsersSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
