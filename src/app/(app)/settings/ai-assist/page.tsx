"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { SettingsPage } from "@/components/settings/settings-page";
import { AiAssistSection, ShopFaqSection } from "@/components/settings/ai-assist-section";

export default function Page() {
  return (
    <SettingsPage title="AI Helpers" description="Switch the AI helpers on, choose which ones, and set a daily limit">
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <AiAssistSection />
        <ShopFaqSection />
      </SettingsGuard>
    </SettingsPage>
  );
}
