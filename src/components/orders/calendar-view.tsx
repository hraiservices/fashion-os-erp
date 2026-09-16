"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Inbox, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { istDateString } from "@/lib/ist-date";
import { OrderCardRow } from "@/components/orders/order-row";
import type { Order } from "@/lib/types";
import type { Shop } from "@/lib/settings";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Plain calendar-date components, no ISO/UTC conversion — every order date in this app is
 *  already a bare "YYYY-MM-DD" string, so building the grid from local Date field getters (never
 *  toISOString, which would shift by the browser's UTC offset) keeps this a pure day-count exercise
 *  with no timezone bug to smuggle in. */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface DayEntry {
  date: string;
  day: number;
  inMonth: boolean;
  received: Order[];
  due: Order[];
}

interface CalendarViewProps {
  /** Already filtered by search/tailor/stage/orderType/priority — NOT by date range. The
   *  calendar owns its own time window (the visible month) instead of the shared date-range
   *  filter used by List/Board. */
  orders: Order[];
  canChangeStage?: boolean;
  onAdvance?: (id: string) => void;
  advancingId?: string | null;
  shop?: Shop;
  onRecordPayment?: (order: Order) => void;
  tailorName?: (id: string) => string;
  trackUrlByMobile?: Map<string, string>;
}

export function CalendarView({ orders, canChangeStage, onAdvance, advancingId, shop, onRecordPayment, tailorName, trackUrlByMobile }: CalendarViewProps) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = istDateString();

  const byDate = useMemo(() => {
    const received = new Map<string, Order[]>();
    const due = new Map<string, Order[]>();
    for (const o of orders) {
      if (o.inDate) received.set(o.inDate, [...(received.get(o.inDate) || []), o]);
      if (o.deliveryDate) due.set(o.deliveryDate, [...(due.get(o.deliveryDate) || []), o]);
    }
    return { received, due };
  }, [orders]);

  const days = useMemo<DayEntry[]>(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const gridStart = new Date(year, month, 1 - new Date(year, month, 1).getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const date = toDateStr(d);
      return { date, day: d.getDate(), inMonth: d.getMonth() === month, received: byDate.received.get(date) || [], due: byDate.due.get(date) || [] };
    });
  }, [monthCursor, byDate]);

  // A day in the past with a due order that never got delivered/paid is the one thing on this
  // calendar that needs to grab attention — everything else is just a record of what happened.
  const isOverdueDay = (e: DayEntry) => e.date < today && e.due.some((o) => o.status !== "delivered" && o.status !== "payment");

  const monthLabel = monthCursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const goToday = () => setMonthCursor(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); });
  const goMonth = (delta: number) => setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  const selectedEntry = days.find((e) => e.date === selectedDate) || null;
  const rowProps = { canChangeStage, onAdvance, shop, onRecordPayment, tailorName };
  const groupSiblingsOf = (o: Order) => (o.groupId ? orders.filter((sib) => sib.groupId === o.groupId) : []);
  const groupSizeOf = (o: Order) => (o.groupId ? groupSiblingsOf(o).length : undefined);
  const groupTotalOf = (o: Order) => (o.groupId ? groupSiblingsOf(o).reduce((s, sib) => s + sib.total, 0) : undefined);

  function renderOrderRow(o: Order) {
    return (
      <OrderCardRow
        key={o.id}
        order={o}
        {...rowProps}
        advancing={advancingId === o.id}
        trackUrl={trackUrlByMobile?.get(o.mobile)}
        groupSize={groupSizeOf(o)}
        groupTotal={groupTotalOf(o)}
      />
    );
  }

  const monthNav = (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{monthLabel}</h2>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
        <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => goMonth(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => goMonth(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {monthNav}

      {/* Month grid — a real 7-column calendar at every width. Cells are compact on mobile (just
          a date number + colored dots) and roomier on desktop (badges with counts); both tap
          through to the same day-detail dialog. */}
      <div className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1.5 sm:py-2">
              <span className="sm:hidden">{w.slice(0, 1)}</span>
              <span className="hidden sm:inline">{w}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((e) => {
            const isToday = e.date === today;
            const overdue = isOverdueDay(e);
            const hasAny = e.received.length > 0 || e.due.length > 0;
            return (
              <button
                key={e.date}
                type="button"
                disabled={!hasAny}
                onClick={() => setSelectedDate(e.date)}
                className={cn(
                  "flex min-h-12 flex-col items-center gap-0.5 border-b border-r p-0.5 text-left transition-colors last:border-r-0 [&:nth-child(7n)]:border-r-0 sm:min-h-24 sm:items-start sm:gap-1 sm:p-1.5",
                  !e.inMonth && "bg-muted/20 text-muted-foreground/50",
                  hasAny && "cursor-pointer hover:bg-muted/40",
                  overdue && "bg-red-50 dark:bg-red-950/20"
                )}
              >
                <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-medium sm:size-6 sm:text-xs", isToday && "bg-primary text-primary-foreground")}>
                  {e.day}
                </span>

                {/* Mobile: dots only */}
                {hasAny && (
                  <div className="flex gap-0.5 sm:hidden">
                    {e.received.length > 0 && <span className="size-1.5 rounded-full bg-blue-500" aria-label={`${e.received.length} received`} />}
                    {e.due.length > 0 && <span className={cn("size-1.5 rounded-full", overdue ? "bg-red-500" : "bg-amber-500")} aria-label={`${e.due.length} delivery due`} />}
                  </div>
                )}

                {/* Desktop: badges with counts */}
                <div className="hidden w-full flex-col gap-0.5 sm:flex">
                  {e.received.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                      <Inbox className="size-2.5" /> {e.received.length}
                    </span>
                  )}
                  {e.due.length > 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] font-medium",
                        overdue
                          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      )}
                    >
                      <Truck className="size-2.5" /> {e.due.length}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day-detail dialog — every device taps through to this same list */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedEntry && new Date(`${selectedEntry.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              {selectedEntry.received.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Received ({selectedEntry.received.length})</p>
                  {selectedEntry.received.map(renderOrderRow)}
                </div>
              )}
              {selectedEntry.due.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery due ({selectedEntry.due.length})</p>
                  {selectedEntry.due.map(renderOrderRow)}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
