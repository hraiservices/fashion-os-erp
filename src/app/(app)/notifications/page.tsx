"use client";

import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, Sparkles, CalendarClock, Clock, IndianRupee, RefreshCw } from "lucide-react";
import { useNotificationHistory, getTimeAgo, type NotificationHistoryEntry } from "@/hooks/use-notifications";
import { useEmployeeIdScrubber } from "@/hooks/use-employees";
import { categoryOf, notificationUrl, isCritical, CATEGORY_LABELS } from "@/lib/notification-alerts";
import { STAGE_STYLE } from "@/lib/design/stages";
import { STAGE_META, type Stage } from "@/lib/business-rules";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

/** Resolves a stage-change notification's target stage to its icon — same lookup notification-bell.tsx uses. */
function stageIcon(toStage: string | null) {
  const key = (toStage || "").toLowerCase().replace(/\s|✓/g, "") as Stage;
  const match = (Object.keys(STAGE_META) as Stage[]).find((s) => s === key || STAGE_META[s].label.toLowerCase().replace(/\s|✓/g, "") === key);
  return match ? STAGE_STYLE[match].icon : RefreshCw;
}

function iconFor(n: NotificationHistoryEntry) {
  switch (n.type) {
    case "ai_briefing":
      return Sparkles;
    case "leave_request":
      return CalendarClock;
    case "attendance":
      return Clock;
    case "payment_received":
    case "day_book_summary":
      return IndianRupee;
    case "stage_change":
      return stageIcon(n.to_stage);
    default:
      return Bell;
  }
}

function titleFor(n: NotificationHistoryEntry): string {
  if (n.type === "stage_change") return n.customer_name || "Order";
  if (n.type === "leave_request") return "Leave request";
  if (n.type === "attendance") return "Attendance";
  if (n.type === "payment_received") return "Payment received";
  if (n.type === "day_book_summary") return "Day Book";
  if (n.type === "ai_briefing") return "Today's briefing";
  return "Notification";
}

/**
 * Everything the bell has sent this user, read or not (capped at 100 server-side) — the bell
 * itself only ever shows unread, so once something was dismissed there was no way to look it up
 * again ("did I already see that leave request?", "what did the briefing say three days ago?").
 */
export default function NotificationHistoryPage() {
  const router = useRouter();
  const { data: notifications, isLoading, isError, error } = useNotificationHistory();
  const scrubIds = useEmployeeIdScrubber();

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Notifications" description="Everything sent to your bell, read or not — the bell itself only shows the latest 40 unread." />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {isError && <EmptyState icon={Bell} title="Couldn't load notifications" description={error instanceof Error ? error.message : "Try again."} />}

      {notifications && notifications.length === 0 && <EmptyState icon={CheckCircle2} title="Nothing yet" description="Notifications will show up here as they happen." />}

      {notifications && notifications.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {notifications.map((n) => {
            const Icon = iconFor(n);
            const href = notificationUrl(n);
            const critical = isCritical(n);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => href && router.push(href)}
                  disabled={!href}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-muted/40 disabled:cursor-default"
                >
                  <Icon className={`mt-0.5 size-4 shrink-0 ${critical ? "text-red-600" : "text-muted-foreground"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{titleFor(n)}</p>
                      <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[categoryOf(n.type)]}</Badge>
                      {!n.isRead && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                    </div>
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                      {n.type === "stage_change" ? `${n.from_stage || "?"} → ${n.to_stage || "?"} · ${scrubIds(n.user_name) || "user"}` : scrubIds(n.message) || "—"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{getTimeAgo(n.created_at)}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
