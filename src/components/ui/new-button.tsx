import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The one green "+ New" button that sits top-right on every list page. It opens only that
 * module's own add form (href) or add dialog (onClick) — cross-module creation lives in the
 * topbar's global "New" menu instead. Label stays "New" everywhere so the button is recognisable
 * at a glance; `aria-label` carries the module-specific wording for screen readers.
 */
export function NewButton({ href, onClick, label = "New", ariaLabel, className }: { href?: string; onClick?: () => void; label?: string; ariaLabel?: string; className?: string }) {
  const classes = cn("bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500", className);
  if (href) {
    return (
      <Button className={classes} aria-label={ariaLabel} nativeButton={false} render={<Link href={href} />}>
        <Plus className="size-4" /> {label}
      </Button>
    );
  }
  return (
    <Button type="button" className={classes} aria-label={ariaLabel} onClick={onClick}>
      <Plus className="size-4" /> {label}
    </Button>
  );
}
