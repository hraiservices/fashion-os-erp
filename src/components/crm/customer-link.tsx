import Link from "next/link";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small, separate icon-button next to a customer's name that opens their record at
 * /crm/[mobile] — never the name itself, so a tap near the name (order lists, invoice rows,
 * report tables…) can't accidentally navigate away mid-scroll on a phone. Renders nothing when
 * there's no mobile number to link to (a walk-in with no number on file, a legacy row).
 */
export function CustomerLink({ mobile, className, label }: { mobile: string | null | undefined; className?: string; label?: string }) {
  if (!mobile) return null;
  return (
    <Link
      href={`/crm/${encodeURIComponent(mobile)}`}
      aria-label={label ? `Open ${label}'s customer record` : "Open customer record"}
      title="Open customer record"
      onClick={(e) => e.stopPropagation()}
      className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-primary", className)}
    >
      <UserRound className="size-3.5" />
    </Link>
  );
}
