import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The "< Back to X" link every form header / detail page reinvented slightly differently
 * (inconsistent icon/text sizing, some via a ghost Button, most via a bare Link) — this is
 * the one place to tune it. size-5/text-base/font-medium rather than the old size-4/text-sm:
 * on a phone this is the primary way back off a form or detail page, so it needs to read and
 * tap easily, the same reasoning behind enlarging the Reports section's mobile back link.
 */
export function BackLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-1 text-base font-medium text-muted-foreground hover:text-foreground transition-colors", className)}>
      <ArrowLeft className="size-5" /> {children}
    </Link>
  );
}
