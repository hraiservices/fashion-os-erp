"use client";

import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_CARD_HEADER_BG_CONFIG, resolveCardHeaderBgUrl, type CardHeaderBgConfig } from "@/lib/card-header-bg";
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
  // Settings → Personalize → Appearance lets an admin replace or turn this off; see
  // card-header-bg-section.tsx. Dark mode skips it — the illustration is drawn for a light
  // background and would just look washed-out grey, not faded, on a dark one.
  const { data: bgCfg } = useAppSetting<CardHeaderBgConfig>("cardHeaderBg", DEFAULT_CARD_HEADER_BG_CONFIG);
  const cfg = bgCfg ?? DEFAULT_CARD_HEADER_BG_CONFIG;

  return (
    // Stacked (not wrapped) below `sm`: relying on flex-wrap + justify-between to drop a wide
    // action toolbar onto its own line is a known Safari/iOS flexbox gap miscalculation — it
    // can keep everything on one row and let the actions overflow the viewport instead of
    // wrapping, forcing the whole page to scroll horizontally. A plain column stack on mobile
    // sidesteps that engine bug entirely; `sm:` restores the original row layout for desktop.
    <div className={cn("relative flex flex-col items-start gap-3 overflow-hidden rounded-lg sm:flex-row sm:flex-wrap sm:items-start sm:justify-between", className)}>
      {cfg.enabled && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.08] dark:hidden"
          style={{ backgroundImage: `url(${resolveCardHeaderBgUrl(cfg)})`, backgroundRepeat: "repeat", backgroundSize: "170px 170px" }}
        />
      )}
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {/* No `shrink-0` on purpose: a wide toolbar that refuses to shrink runs off the right edge
          on a tablet (measured at 820px on Dashboard) instead of wrapping. The buttons inside
          carry their own `shrink-0`, so letting this box shrink makes its flex-wrap drop them to
          the next line rather than squashing any of them. */}
      {actions && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
    </div>
  );
}
