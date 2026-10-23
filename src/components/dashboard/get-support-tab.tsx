import { Mail, MessageCircle, Globe } from "lucide-react";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_WEBSITE, supportWhatsAppHref } from "@/lib/support-contact";

const CONTACTS = [
  { icon: MessageCircle, label: "WhatsApp", value: SUPPORT_PHONE, href: supportWhatsAppHref(), tone: "text-emerald-600 dark:text-emerald-400" },
  { icon: Mail, label: "E-Mail", value: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}`, tone: "text-blue-600 dark:text-blue-400" },
  { icon: Globe, label: "Website", value: SUPPORT_WEBSITE.replace(/^https?:\/\//, ""), href: SUPPORT_WEBSITE, tone: "text-violet-600 dark:text-violet-400" },
] as const;

/** Fourth Dashboard tab, after Recent Updates — a plain "how to reach us" page. Contact details
 *  come from the same src/lib/support-contact.ts the desktop footer already uses. */
export function GetSupportTab() {
  return (
    <div className="mx-auto max-w-md space-y-6 py-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- static public asset, not an optimizable remote image */}
      <img src="/icon-512.png" alt="Fashion Flow" className="mx-auto size-20 rounded-2xl shadow-sm" />

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">We are here to help you out!</h2>
        <p className="text-sm text-muted-foreground">Do not worry any more. Speak to us.</p>
      </div>

      <div className="space-y-3">
        {CONTACTS.map((c) => (
          <a
            key={c.label}
            href={c.href}
            target={c.label === "Website" ? "_blank" : undefined}
            rel={c.label === "Website" ? "noopener noreferrer" : undefined}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40"
          >
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted ${c.tone}`}>
              <c.icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">{c.label}</span>
              <span className="block truncate text-sm font-medium">{c.value}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
