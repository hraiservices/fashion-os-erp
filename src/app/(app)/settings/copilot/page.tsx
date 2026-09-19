"use client";

import { SettingsGuard } from "@/components/settings/settings-guard";
import { PageHeader } from "@/components/ui/page-header";
import { ClaudeCopilotConnectionSection } from "@/components/settings/claude-copilot-connection-section";
import { AiCopilotConnectionSection } from "@/components/settings/ai-copilot-connection-section";
import { ChatbotGlossarySection } from "@/components/settings/chatbot-glossary-section";

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <PageHeader title="AI Copilot" description="Connect the AI and teach it your company's own vocabulary, so it stops guessing" />
      <SettingsGuard allow={({ isAdmin }) => isAdmin}>
        <ClaudeCopilotConnectionSection />
        <AiCopilotConnectionSection />
        <ChatbotGlossarySection />
      </SettingsGuard>
    </div>
  );
}
