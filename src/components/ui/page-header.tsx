import { cn } from "@/lib/utils";

/**
 * Consistent page title block. Replaces the ad-hoc `<h1 className="text-xl…">` +
 * flex-wrap header that every page reinvented slightly differently.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    // Stacked (not wrapped) below `sm`: relying on flex-wrap + justify-between to drop a wide
    // action toolbar onto its own line is a known Safari/iOS flexbox gap miscalculation — it
    // can keep everything on one row and let the actions overflow the viewport instead of
    // wrapping, forcing the whole page to scroll horizontally. A plain column stack on mobile
    // sidesteps that engine bug entirely; `sm:` restores the original row layout for desktop.
    <div className={cn("flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
    </div>
  );
}
