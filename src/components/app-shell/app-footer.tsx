import { Mail, Phone } from "lucide-react";
import { APP_VERSION } from "@/lib/app-version";

const SUPPORT_EMAIL = "connect@fashionflow.app";
const SUPPORT_PHONE = "+919897504343";

/** A thin line at the bottom of every page — version + support contact, nothing else. Desktop
 *  only (hidden below lg): on mobile that space is already spoken for by the bottom tab bar. */
export function AppFooter() {
  return (
    <footer className="hidden shrink-0 items-center justify-between gap-4 border-t px-6 py-2 text-xs text-muted-foreground lg:flex print:hidden">
      <span>Fashion Flow v{APP_VERSION}</span>
      <span className="flex items-center gap-4">
        <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
          <Mail className="size-3.5" /> {SUPPORT_EMAIL}
        </a>
        <a href={`tel:${SUPPORT_PHONE}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
          <Phone className="size-3.5" /> {SUPPORT_PHONE}
        </a>
      </span>
    </footer>
  );
}
