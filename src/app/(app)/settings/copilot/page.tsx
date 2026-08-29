"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { PageHeader } from "@/components/ui/page-header";
import { ChatbotGlossarySection } from "@/components/settings/chatbot-glossary-section";
import { DailyBriefingWhatsAppSection } from "@/components/settings/daily-briefing-whatsapp-section";

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <PageHeader title="AI Copilot" description="Teach the AI Copilot your company's own vocabulary, so it stops guessing" />
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <ChatbotGlossarySection />
        <DailyBriefingWhatsAppSection />
      </SettingsGuard>
    </div>
  );
}
