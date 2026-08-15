"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2, X, CheckCircle2, AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { useOrders } from "@/hooks/use-orders";
import { useNotifications, useDismissNotification, markNotificationsSeen, getLastSeenAt, getTimeAgo } from "@/hooks/use-notifications";
import { useCurrentUser } from "@/hooks/use-current-user";
import { dueBadge, STAGE_META, type Stage } from "@/lib/business-rules";
import { STAGE_STYLE } from "@/lib/design/stages";
import { createClient } from "@/lib/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Resolves a stage-change notification's target stage to its icon. */
function stageIcon(toStage: string | null) {
  const key = (toStage || "").toLowerCase().replace(/\s|✓/g, "") as Stage;
  const match = (Object.keys(STAGE_META) as Stage[]).find((s) => s === key || STAGE_META[s].label.toLowerCase().replace(/\s|✓/g, "") === key);
  return match ? STAGE_STYLE[match].icon : RefreshCw;
}

/** StageNotifPanel(), Stitching_Manager_Pro_v16.html ~line 14029. */
export function NotificationBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: orders } = useOrders();
  const { data: notifs } = useNotifications();
  const { data: user } = useCurrentUser();
  const dismissNotification = useDismissNotification();
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";
  const canClearAll = isAdminOrManager;

  // Briefing content isn't sensitive, just not relevant to tailor/sales roles — hidden client-side
  // since admin_notifications has no per-role targeting at the row level.
  const stageNotifs = (notifs || []).filter((n) => n.type !== "ai_briefing");
  const briefingNotifs = isAdminOrManager ? (notifs || []).filter((n) => n.type === "ai_briefing") : [];

  const urgentOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => dueBadge(o)?.urgent || o.status === "ready").slice(0, 10);
  }, [orders]);

  const unreadCount = useMemo(() => {
    const lastSeen = getLastSeenAt();
    const visible = [...stageNotifs, ...briefingNotifs];
    const newNotifs = visible.filter((n) => new Date(n.created_at).getTime() > lastSeen).length;
    // Only count urgent orders created after the bell was last opened — orders that have been
    // sitting in the list (and been seen) shouldn't re-trigger the badge on every render.
    const newUrgent = urgentOrders.filter((o) => new Date(o.createdAt).getTime() > lastSeen).length;
    return newNotifs + newUrgent;
  }, [stageNotifs, briefingNotifs, urgentOrders]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) markNotificationsSeen();
  }

  function goToOrder(orderId: string | null) {
    if (!orderId) return;
    handleOpenChange(false);
    router.push(`/orders/${orderId}`);
  }

  async function clearAll() {
    const supabase = createClient();
    // Soft-delete (mark read) rather than hard DELETE — avoids RLS issues and is consistent
    // with how individual dismiss works. Hard DELETE is blocked by default RLS policies.
    await supabase.from("admin_notifications").update({ read: true }).eq("read", false);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  const hasItems = urgentOrders.length > 0 || stageNotifs.length > 0 || briefingNotifs.length > 0;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="relative size-9 sm:size-8" aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} new)` : ""}`}>
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-[min(22rem,calc(100vw-1.5rem))] p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {hasItems && canClearAll && (
            <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" onClick={clearAll}>
              <Trash2 className="size-3.5" /> Clear all
            </button>
          )}
        </div>

        <div className="max-h-[min(24rem,60dvh)] overflow-y-auto">
          {!hasItems && <EmptyState icon={CheckCircle2} title="All clear" description="Nothing needs your attention." className="border-0 py-8" />}

          {urgentOrders.length > 0 && (
            <div>
              <div className="bg-muted/50 px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Urgent orders</div>
              {urgentOrders.map((o) => {
                const badge = dueBadge(o);
                const isReady = o.status === "ready";
                const Icon = isReady ? CheckCircle2 : AlertTriangle;
                return (
                  <button
                    key={o.id}
                    onClick={() => goToOrder(o.id)}
                    className="flex w-full items-start gap-2.5 border-b px-4 py-2.5 text-left last:border-0 hover:bg-muted/40"
                  >
                    <Icon className={`mt-0.5 size-4 shrink-0 ${isReady ? "text-emerald-600" : "text-red-600"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{o.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {isReady ? "Ready for pickup" : badge?.text || "Overdue"} · {o.id}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {briefingNotifs.length > 0 && (
            <div>
              <div className="bg-muted/50 px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Today&apos;s briefing</div>
              {briefingNotifs.map((n) => (
                <div key={n.id} className="flex items-start gap-2.5 border-b px-4 py-2.5 last:border-0 hover:bg-muted/40">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-line text-sm">{n.message}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{getTimeAgo(n.created_at)}</p>
                  </div>
                  <button
                    onClick={() => dismissNotification.mutate(n.id)}
                    aria-label="Dismiss briefing"
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {stageNotifs.length > 0 && (
            <div>
              <div className="bg-muted/50 px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Stage updates</div>
              {stageNotifs.map((n) => {
                const Icon = stageIcon(n.to_stage);
                return (
                  <button
                    key={n.id}
                    onClick={() => goToOrder(n.order_id)}
                    className="flex w-full items-start gap-2.5 border-b px-4 py-2.5 text-left last:border-0 hover:bg-muted/40"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{n.customer_name || "Order"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {n.from_stage || "?"} → {n.to_stage || "?"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {n.user_name || "user"} · {getTimeAgo(n.created_at)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
