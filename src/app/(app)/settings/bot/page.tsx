import { SettingsPage } from "@/components/settings/settings-page";
import { ComingSoon } from "@/components/app-shell/coming-soon";

export default function Page() {
  return (
    <SettingsPage title="Bot / AI" description="Train the customer-facing chatbot">
      <ComingSoon title="Chatbot training & config" />
    </SettingsPage>
  );
}
