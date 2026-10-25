"use client";

import { History } from "lucide-react";
import { useCustomerActivity } from "@/hooks/use-customer-activity";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";

/** Zoho-style chronological activity feed — every field edit, notification, stage change,
 *  payment and measurement update for this customer, merged from activity_log + whatsapp_message_log
 *  (see /api/customers/[mobile]/activity). */
export function CustomerActivityTimeline({ mobile }: { mobile: string }) {
  const { events, isLoading, hasMore, loadMore } = useCustomerActivity(mobile);

  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <History className="size-4 text-muted-foreground" /> Activity
        </h2>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState icon={History} title="No activity yet" className="border-0" />
      ) : (
        <ul className="divide-y">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              <div className="min-w-0 flex-1">
                <p>{e.text}</p>
                <p className="text-xs text-muted-foreground">
                  {e.actor ? `${e.actor} · ` : ""}
                  {fmtDate(e.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="border-t p-2 text-center">
          <Button variant="ghost" size="sm" onClick={loadMore}>
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}
