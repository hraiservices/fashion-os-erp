"use client";

import { Sparkles } from "lucide-react";
import { SHIPPED_UPDATES, UPCOMING_FEATURES } from "@/lib/changelog";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** What's new on Fashion Flow, and what's planned next — mirrors Zoho's "Recent Updates" tab.
 *  See src/lib/changelog.ts for where the content itself lives and how it's kept up to date. */
export function RecentUpdatesTab() {
  return (
    <div className="space-y-8">
      <div>
        {SHIPPED_UPDATES.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to show yet.</p>
        ) : (
          <ol className="space-y-6">
            {SHIPPED_UPDATES.map((entry, i) => (
              <li key={`${entry.date}-${entry.title}`} className="relative pl-6">
                {i < SHIPPED_UPDATES.length - 1 && <span className="absolute top-3 left-[5px] h-[calc(100%+0.75rem)] w-px bg-border" aria-hidden />}
                <span className={cn("absolute top-1 left-0 size-[11px] rounded-full border-2", i === 0 ? "border-primary bg-primary" : "border-primary bg-background")} aria-hidden />
                <p className="text-xs text-muted-foreground">{fmtDate(entry.date)}</p>
                <h3 className="mt-1 text-base font-semibold">{entry.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-xl border bg-muted/30 p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Coming soon</h2>
        </div>
        {UPCOMING_FEATURES.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing on the roadmap right now — ask for a feature and it&apos;ll show up here once it&apos;s planned.</p>
        ) : (
          <ul className="space-y-4">
            {UPCOMING_FEATURES.map((entry) => (
              <li key={entry.title}>
                <h3 className="text-sm font-semibold">{entry.title}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{entry.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
