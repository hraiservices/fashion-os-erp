"use client";

import { AlertTriangle } from "lucide-react";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isLicenseExpired, daysUntilExpiry } from "@/lib/entitlements";

/** Non-blocking, app-wide renewal notice — never restricts functionality, just nudges toward renewal. Shown when the license is past its paidUntil date or within 7 days of it. */
export function ExpiryBanner() {
  const { data: entitlements } = useModuleEntitlements();
  if (!entitlements) return null;

  const expired = isLicenseExpired(entitlements);
  const days = daysUntilExpiry(entitlements);
  if (!expired && (days === null || days > 7)) return null;

  return (
    <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-800 print:hidden dark:bg-amber-950/40 dark:text-amber-300">
      <AlertTriangle className="size-4 shrink-0" />
      <span>
        {expired
          ? "Your subscription has expired. Please renew to avoid interruption."
          : `Your subscription expires in ${days} day${days === 1 ? "" : "s"}. Please renew soon.`}
      </span>
    </div>
  );
}
