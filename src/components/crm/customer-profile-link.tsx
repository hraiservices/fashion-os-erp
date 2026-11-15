"use client";

import { useSyncExternalStore } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { normalizeIndianMobile } from "@/lib/business-rules";

const noopSubscribe = () => () => {};

/**
 * "📄 Statement" under a customer's Lifetime value: one tap copies this customer's public
 * statement link, and a WhatsApp button next to it sends it straight to the customer.
 *
 * Points at /statement/view/[share_token] (src/app/statement/view/[token]/page.tsx) — a public,
 * unauthenticated, read-only page showing only this customer's own orders/invoices/payments and
 * balance due, the same page already shared from the Statement tab. It was originally built to
 * open the internal /crm/[mobile] staff page instead, which needs a login and shows staff-only
 * actions (Edit/Delete/Record Payment) — reported back by the person who got sent that link and
 * couldn't open it. The share_token (not the mobile number) is what makes the link safe to hand
 * to the customer: a 10-digit mobile number is guessable, the token isn't.
 */
export function CustomerProfileLink({ mobile, name, shareToken }: { mobile: string; name: string; shareToken: string }) {
  // The page's own origin, read the hydration-safe way: "" on the server, the real one in the browser.
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => ""
  );
  const url = `${origin}/statement/view/${shareToken}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Statement link copied");
    } catch {
      // Clipboard access can be refused (an insecure page, a denied permission) — say so rather than pretend.
      toast.error("Couldn't copy the link — copy it from the address bar instead");
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={copy} title="Copy this customer's statement link" className="-ml-2 h-11 gap-1 px-2 text-primary sm:h-7">
        <FileText className="size-3.5" /> Statement
      </Button>
      <WhatsAppIconButton
        href={`https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(
          `Dear *${name}* 🙏\n\nHere's your statement with us:\n${url}`
        )}`}
        label={`Send statement link to ${name} on WhatsApp`}
      />
    </div>
  );
}
