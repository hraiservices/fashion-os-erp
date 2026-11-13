"use client";

import { useSyncExternalStore } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";

const noopSubscribe = () => () => {};

/**
 * "🔗 Profile" under a customer's Lifetime value: one tap copies the address of this customer's
 * page, and a WhatsApp button next to it opens WhatsApp with that address already in a message.
 *
 * This is the staff-side page, so the link needs a login to open — it is meant for passing a
 * customer to a colleague, not for sending to the customer. The WhatsApp button therefore does
 * not pick a recipient: WhatsApp asks who to send it to.
 */
export function CustomerProfileLink({ mobile, name }: { mobile: string; name: string }) {
  // The page's own origin, read the hydration-safe way: "" on the server, the real one in the browser.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
  const url = `${origin}/crm/${encodeURIComponent(mobile)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied");
    } catch {
      // Clipboard access can be refused (an insecure page, a denied permission) — say so rather than pretend.
      toast.error("Couldn't copy the link — copy it from the address bar instead");
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={copy} title="Copy the link to this customer's page" className="-ml-2 h-11 gap-1 px-2 text-primary sm:h-7">
        <Link2 className="size-3.5" /> Profile
      </Button>
      <WhatsAppIconButton
        href={`https://wa.me/?text=${encodeURIComponent(`${name} — customer profile:\n${url}`)}`}
        label="Share this customer's profile link on WhatsApp"
      />
    </div>
  );
}
