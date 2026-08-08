"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { PageHeader } from "@/components/ui/page-header";
import { ChatbotGlossarySection } from "@/components/settings/chatbot-glossary-section";

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <PageHeader title="AI Copilot" description="Teach the AI Copilot your shop's own vocabulary, so it stops guessing" />
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <ChatbotGlossarySection />
      </SettingsGuard>
    </div>
  );
}
