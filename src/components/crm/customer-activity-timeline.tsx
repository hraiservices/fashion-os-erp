"use client";

import { useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { useCustomerActivity } from "@/hooks/use-customer-activity";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShowAllRow } from "@/components/ui/show-all-row";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { DateText } from "@/components/ui/date-text";

/** Events previewed before "Show all". */
const PREVIEW = 5;

/** Zoho-style chronological activity feed — every field edit, notification, stage change,
 *  payment and measurement update for this customer, merged from activity_log + whatsapp_message_log
 *  (see /api/customers/[mobile]/activity). */
export function CustomerActivityTimeline({ mobile }: { mobile: string }) {
  // Starts closed, and nothing is fetched until it is opened: this feed is long (every stage
  // change, payment and edit) and was both the first thing to push the rest of the page down and
  // a request made on every customer page whether or not anyone read it.
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { events, isLoading, hasMore, loadMore } = useCustomerActivity(mobile, open);
  const shown = showAll ? events : events.slice(0, PREVIEW);

  return (
    <section className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn("flex w-full items-center justify-between gap-2 px-4 py-3 text-left", open && "border-b")}
      >
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <History className="size-4 text-muted-foreground" /> Activity
        </h2>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : events.length === 0 ? (
            <EmptyState icon={History} title="No activity yet" className="border-0" />
          ) : (
            <ul className="divide-y">
              {shown.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  <div className="min-w-0 flex-1">
                    <p>{e.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.actor ? `${e.actor} · ` : ""}
                      <DateText>{fmtDate(e.createdAt)}</DateText>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <ShowAllRow total={events.length} limit={PREVIEW} expanded={showAll} onToggle={() => setShowAll((v) => !v)} moreBeyondTotal={hasMore} />
          {showAll && hasMore && (
            <div className="border-t p-2 text-center">
              <Button variant="ghost" size="sm" onClick={loadMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
