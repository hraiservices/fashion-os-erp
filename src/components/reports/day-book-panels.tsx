"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info, Lock, LockOpen, PackageCheck, CalendarClock, Siren, Users, Banknote, CheckCircle2, MessageCircle, Trash2, Plus, ShieldAlert, ShoppingBag, Clock, Target, Pencil, TrendingUp, TrendingDown, BellRing } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { fmtTime } from "@/lib/day-book";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportCard } from "@/components/reports/report-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PAY_METHOD_COLORS,
  PAY_METHOD_LABELS,
  type CashPosition,
  type DayClosing,
  type DeliveryBoard,
  type DeliveryItem,
  type MethodSplit,
  type PayMethodKey,
  type ReviewFlag,
  type RangeDay,
  type StaffSummary,
} from "@/lib/day-book-extras";
import {
  ADJUSTMENT_REASONS,
  type AttendanceBoard,
  type CashAdjustment,
  type ClosingHistory,
  type Collections,
  type DiscountSummary,
  type SoldToday,
} from "@/lib/day-book-insights";

const METHOD_ORDER: PayMethodKey[] = ["cash", "upi", "card", "bank", "other"];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

/** Cash / UPI / card / bank split of everything collected that day, as one stacked bar. */
export function PaymentMethodsCard({ split }: { split: MethodSplit }) {
  const total = METHOD_ORDER.reduce((s, k) => s + split[k], 0);
  const used = METHOD_ORDER.filter((k) => split[k] > 0);
  return (
    <ReportCard className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Collected by method</SectionLabel>
        <span className="text-sm font-semibold tabular-nums">{inr(total)}</span>
      </div>
      {total === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No payments received on this day.</p>
      ) : (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {used.map((k) => (
              <div key={k} style={{ width: `${(split[k] / total) * 100}%`, background: PAY_METHOD_COLORS[k] }} title={`${PAY_METHOD_LABELS[k]} ${inr(split[k])}`} />
            ))}
          </div>
          <ul className="space-y-1.5">
            {used.map((k) => (
              <li key={k} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: PAY_METHOD_COLORS[k] }} />
                  {PAY_METHOD_LABELS[k]}
                </span>
                <span className="tabular-nums">
                  <span className="font-medium">{inr(split[k])}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{Math.round((split[k] / total) * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ReportCard>
  );
}

/** Opening + cash in − cash out = expected drawer, and the count-and-close form. */
export function CashPositionCard({
  date,
  cash,
  closing,
  canClose,
  isAdmin,
  busy,
  onClose,
}: {
  date: string;
  cash: CashPosition;
  closing: DayClosing | null;
  canClose: boolean;
  /** Only an admin can re-close a day that's already closed. */
  isAdmin: boolean;
  busy: boolean;
  onClose: (countedCash: number, note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const showForm = canClose && (!closing || (editing && isAdmin));
  const countedNum = counted === "" ? null : parseFloat(counted);
  const liveVariance = countedNum != null && Number.isFinite(countedNum) ? countedNum - cash.expected : null;

  return (
    <ReportCard className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>Cash drawer</SectionLabel>
        {closing ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Lock className="size-3" /> Closed
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <LockOpen className="size-3" /> Open
          </span>
        )}
      </div>

      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            Opening cash
            {cash.openingFromDate && <span className="ml-1 text-[11px]">(counted {fmtDate(cash.openingFromDate)})</span>}
          </dt>
          <dd className="tabular-nums">{inr(cash.opening)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">+ Cash received</dt>
          <dd className="tabular-nums text-emerald-600 dark:text-emerald-400">{inr(cash.cashIn)}</dd>
        </div>
        {cash.breakdown.adjustmentsIn > 0 && (
          <div className="flex justify-between pl-3 text-xs text-muted-foreground">
            <dt>of which cash added (adjustments)</dt>
            <dd className="tabular-nums">{inr(cash.breakdown.adjustmentsIn)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted-foreground">− Cash paid out</dt>
          <dd className="tabular-nums text-red-600 dark:text-red-400">{inr(cash.cashOut)}</dd>
        </div>
        {(
          [
            ["Expenses", cash.breakdown.expenses],
            ["Vendor payments", cash.breakdown.vendorPayments],
            ["Salary advances", cash.breakdown.advances],
            ["Withdrawals / deposits / other", cash.breakdown.adjustmentsOut],
          ] as const
        )
          .filter(([, v]) => v > 0)
          .map(([label, v]) => (
            <div key={label} className="flex justify-between pl-3 text-xs text-muted-foreground">
              <dt>{label}</dt>
              <dd className="tabular-nums">{inr(v)}</dd>
            </div>
          ))}
        <div className="flex justify-between border-t pt-1.5 font-semibold">
          <dt>Expected in drawer</dt>
          <dd className="tabular-nums">{inr(cash.expected)}</dd>
        </div>
      </dl>

      {closing && (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm",
            closing.variance === 0 ? "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30" : "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30"
          )}
        >
          <div className="flex items-center justify-between">
            <span>Counted</span>
            <span className="font-semibold tabular-nums">{inr(closing.countedCash)}</span>
          </div>
          <p className={cn("mt-1 text-xs font-medium", closing.variance === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
            {closing.variance === 0 ? "Matches exactly" : `${closing.variance > 0 ? "Over" : "Short"} by ${inr(Math.abs(closing.variance))}`}
          </p>
          {closing.note && <p className="mt-1 text-xs text-muted-foreground">“{closing.note}”</p>}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Closed by {closing.closedBy?.split("@")[0] || "—"} · {new Date(closing.closedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
      )}

      {showForm && (
        <form
          className="space-y-2 border-t pt-3 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            if (countedNum == null || !Number.isFinite(countedNum) || countedNum < 0) return;
            onClose(countedNum, note);
            setEditing(false);
          }}
        >
          <p className="text-xs text-muted-foreground">Count the cash in the drawer for {fmtDate(date)} and enter it below.</p>
          <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder="Cash counted (₹)" value={counted} onChange={(e) => setCounted(e.target.value)} className="h-10" />
          {liveVariance != null && (
            <p className={cn("text-xs font-medium", liveVariance === 0 ? "text-emerald-600" : "text-amber-600")}>
              {liveVariance === 0 ? "Matches expected" : `${liveVariance > 0 ? "Over" : "Short"} by ${inr(Math.abs(liveVariance))}`}
            </p>
          )}
          <Input placeholder="Note (optional) — e.g. ₹500 given to courier" value={note} onChange={(e) => setNote(e.target.value)} className="h-10" maxLength={500} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || countedNum == null || !Number.isFinite(countedNum) || countedNum < 0} className="flex-1">
              <Lock className="size-4" /> {closing ? "Re-close day" : "Close day"}
            </Button>
            {closing && (
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
      {closing && isAdmin && !editing && (
        <Button variant="outline" size="sm" className="w-full print:hidden" onClick={() => setEditing(true)}>
          Re-count and re-close
        </Button>
      )}
      {closing && !isAdmin && <p className="text-xs text-muted-foreground print:hidden">This day is locked — only an admin can re-close it.</p>}
      {!canClose && !closing && <p className="text-xs text-muted-foreground">Only users who can manage payments can close the day.</p>}
    </ReportCard>
  );
}

function DeliveryList({ icon: Icon, title, items, tone, empty }: { icon: typeof PackageCheck; title: string; items: DeliveryItem[]; tone?: "danger"; empty: string }) {
  const shown = items.slice(0, 6);
  return (
    <div className="min-w-0">
      <p className={cn("mb-1.5 flex items-center gap-1.5 text-xs font-medium", tone === "danger" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
        <Icon className="size-3.5" /> {title} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="pl-5 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5 pl-5">
          {shown.map((o) => (
            <li key={o.orderId} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/orders/${o.orderId}`} className="min-w-0 truncate font-medium text-primary hover:underline">
                {o.customerName}
              </Link>
              {o.balance > 0 ? <span className="shrink-0 text-xs font-medium text-red-600 tabular-nums dark:text-red-400">{inr(o.balance)} due</span> : <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />}
            </li>
          ))}
          {items.length > shown.length && (
            <li>
              <Link href="/orders" className="text-xs text-muted-foreground hover:text-foreground">
                +{items.length - shown.length} more
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** What's due, overdue and delivered — and what's still unpaid on today's deliveries. */
export function DeliveriesCard({ board, isToday }: { board: DeliveryBoard; isToday: boolean }) {
  return (
    <ReportCard className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Deliveries &amp; collections</SectionLabel>
        {board.unpaidOnDeliveredToday > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            {inr(board.unpaidOnDeliveredToday)} unpaid on delivered orders
          </span>
        )}
      </div>
      <div className={cn("grid gap-4", isToday ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <DeliveryList icon={CalendarClock} title="Due this day" items={board.dueToday} empty="Nothing due" />
        {isToday && <DeliveryList icon={Siren} title="Overdue" items={board.overdue} tone="danger" empty="Nothing overdue" />}
        <DeliveryList icon={PackageCheck} title="Delivered" items={board.deliveredToday} empty="No deliveries" />
      </div>
    </ReportCard>
  );
}

/** Deletions, refunds, big/backdated expenses, cash variance, post-close entries. */
export function ReviewStrip({ flags }: { flags: ReviewFlag[] }) {
  if (flags.length === 0) return null;
  const warns = flags.filter((f) => f.severity === "warn").length;
  return (
    <ReportCard className={cn("space-y-2 p-4", warns > 0 && "border-amber-500/40")}>
      <div className="flex items-center gap-2">
        <AlertTriangle className={cn("size-4", warns > 0 ? "text-amber-600" : "text-muted-foreground")} />
        <SectionLabel>Needs review ({flags.length})</SectionLabel>
      </div>
      <ul className="divide-y">
        {flags.map((f) => {
          const body = (
            <div className="flex items-start gap-2 py-2 text-sm">
              {f.severity === "warn" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" /> : <Info className="mt-0.5 size-3.5 shrink-0 text-sky-600" />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{f.title}</p>
                <p className="truncate text-xs text-muted-foreground">{f.detail}</p>
              </div>
              {f.amount != null && <span className="shrink-0 font-medium tabular-nums">{inr(f.amount)}</span>}
            </div>
          );
          return (
            <li key={f.id}>
              {f.href ? (
                <Link href={f.href} className="block hover:bg-muted/40">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </ReportCard>
  );
}

/** Entries and money handled per user — who did what today. */
export function StaffSummaryCard({ rows }: { rows: StaffSummary[] }) {
  if (rows.length === 0) return null;
  return (
    <ReportCard className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" />
        <SectionLabel>By staff</SectionLabel>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.user} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{r.user}</span>
            <span className="flex shrink-0 items-center gap-3 tabular-nums">
              <span className="text-xs text-muted-foreground">
                {r.entries} {r.entries === 1 ? "entry" : "entries"}
              </span>
              <span className="w-24 text-right font-medium">
                <Banknote className="mr-1 inline size-3 text-muted-foreground" />
                {inr(r.amount)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </ReportCard>
  );
}

// ── Cash adjustments ─────────────────────────────────────────────────────

/** Cash moved in/out of the drawer outside normal payments — deposits, withdrawals, cash salary. */
export function CashAdjustmentsCard({
  date,
  adjustments,
  closed,
  canEdit,
  isAdmin,
  busy,
  onAdd,
  onRemove,
}: {
  date: string;
  adjustments: CashAdjustment[];
  closed: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  busy: boolean;
  onAdd: (input: { kind: "in" | "out"; amount: number; reason: string; note: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [kind, setKind] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>(ADJUSTMENT_REASONS[0]);
  const [note, setNote] = useState("");
  const locked = closed && !isAdmin;
  const amt = parseFloat(amount);

  if (!canEdit && adjustments.length === 0) return null;
  return (
    <ReportCard className="space-y-3 p-4">
      <SectionLabel>Cash in / out (not a sale or expense)</SectionLabel>
      {adjustments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Bank deposits, owner withdrawals, cash salary and float top-ups go here, so the drawer reconciles.</p>
      ) : (
        <ul className="divide-y">
          {adjustments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", a.kind === "in" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300")}>
                {a.kind === "in" ? "In" : "Out"}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {a.reason}
                {a.note && <span className="text-muted-foreground"> — {a.note}</span>}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{inr(a.amount)}</span>
              {canEdit && !locked && (
                <button type="button" aria-label="Remove adjustment" disabled={busy} onClick={() => onRemove(a.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive print:hidden">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && !locked && (
        <form
          className="space-y-2 border-t pt-3 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            if (!Number.isFinite(amt) || amt <= 0) return;
            onAdd({ kind, amount: amt, reason, note });
            setAmount("");
            setNote("");
          }}
        >
          <div className="flex gap-2">
            <div className="flex overflow-hidden rounded-md border text-sm" role="group" aria-label="Direction">
              {(["out", "in"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={cn("px-3 py-2 font-medium", kind === k ? (k === "in" ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "bg-card text-muted-foreground")}>
                  {k === "out" ? "Cash out" : "Cash in"}
                </button>
              ))}
            </div>
            <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder="₹ Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 min-w-0 flex-1" />
          </div>
          <Select value={reason} onValueChange={(v) => v && setReason(v)}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue>{reason}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ADJUSTMENT_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="h-10" maxLength={300} />
          <Button type="submit" variant="outline" className="w-full" disabled={busy || !Number.isFinite(amt) || amt <= 0}>
            <Plus className="size-4" /> Record for {fmtDate(date)}
          </Button>
        </form>
      )}
      {locked && <p className="text-xs text-muted-foreground print:hidden">This day is closed — only an admin can change its cash.</p>}
    </ReportCard>
  );
}

// ── Unclosed days + variance history ─────────────────────────────────────

export function UnclosedBanner({ days, onPick }: { days: string[]; onPick: (date: string) => void }) {
  if (days.length === 0) return null;
  const shown = days.slice(-8);
  return (
    <ReportCard className="flex flex-wrap items-center gap-2 border-amber-500/40 bg-amber-50 p-3 dark:bg-amber-950/30 print:hidden">
      <BellRing className="size-4 shrink-0 text-amber-600" />
      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
        {days.length} earlier {days.length === 1 ? "day" : "days"} had activity but {days.length === 1 ? "was" : "were"} never closed:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((d) => (
          <button key={d} type="button" onClick={() => onPick(d)} className="rounded-full border border-amber-500/40 bg-card px-2.5 py-0.5 text-xs font-medium hover:bg-muted">
            {fmtDate(d)}
          </button>
        ))}
        {days.length > shown.length && <span className="self-center text-xs text-muted-foreground">+{days.length - shown.length} older</span>}
      </div>
    </ReportCard>
  );
}

export function VarianceHistoryCard({ history }: { history: ClosingHistory | undefined }) {
  const closings = history?.closings || [];
  if (closings.length === 0) return null;
  const shortCount = closings.filter((c) => c.variance < 0).length;
  const net = closings.reduce((s, c) => s + c.variance, 0);
  const data = closings.map((c) => ({ ...c, label: `${c.date.slice(8)}/${c.date.slice(5, 7)}` }));
  return (
    <ReportCard className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Cash over / short — last 30 days</SectionLabel>
        <span className={cn("text-xs font-medium", net === 0 ? "text-muted-foreground" : net < 0 ? "text-red-600" : "text-emerald-600")}>
          {shortCount} short · net {net === 0 ? "₹0" : `${net > 0 ? "+" : "−"}${inr(Math.abs(net))}`}
        </span>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} fontSize={10} />
            <ReferenceLine y={0} stroke="currentColor" opacity={0.3} />
            <Tooltip formatter={(v) => inr(Number(v))} labelFormatter={(_l, p) => (p?.[0]?.payload ? fmtDate(p[0].payload.date) : "")} contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }} />
            <Bar dataKey="variance" name="Variance" radius={[3, 3, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.date} fill={d.variance === 0 ? "#94a3b8" : d.variance < 0 ? "#ef4444" : "#059669"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ReportCard>
  );
}

// ── Collections follow-up ────────────────────────────────────────────────

export function CollectionsCard({ data, date, shopName, shopPhone }: { data: Collections; date: string; shopName?: string; shopPhone?: string }) {
  if (data.count === 0) return null;
  function reminder(name: string, mobile: string, due: number, orderId: string) {
    const text = `Dear *${name || "Customer"}* 🙏\n\n₹${due} is pending on your order ${orderId} at *${shopName || "our company"}*.\nPlease clear at your earliest convenience.\n📞 ${shopPhone || ""}`;
    return `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(text)}`;
  }
  return (
    <ReportCard className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Collect today ({data.count}{data.count >= 200 ? "+" : ""})</SectionLabel>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{inr(data.totalDue)} outstanding</span>
      </div>
      <ul className="divide-y">
        {data.items.map((o) => {
          const late = Math.max(0, Math.round((new Date(date).getTime() - new Date(o.deliveryDate).getTime()) / 86_400_000));
          return (
            <li key={o.orderId} className="flex items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <Link href={`/orders/${o.orderId}`} className="block truncate font-medium text-primary hover:underline">
                  {o.customerName}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {o.orderId} · due {fmtDate(o.deliveryDate)}
                  {late > 0 && <span className="text-red-600 dark:text-red-400"> · {late}d late</span>}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-red-600 dark:text-red-400">{inr(o.balance)}</span>
              <a
                href={reminder(o.customerName, o.mobile, o.balance, o.orderId)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp reminder to ${o.customerName}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 print:hidden"
              >
                <MessageCircle className="size-4" />
              </a>
            </li>
          );
        })}
      </ul>
      {data.count > data.items.length && (
        <Link href="/reports/customer-balances" className="block text-xs text-muted-foreground hover:text-foreground">
          +{data.count - data.items.length} more — see Customer Balances
        </Link>
      )}
    </ReportCard>
  );
}

// ── Sold today ───────────────────────────────────────────────────────────

function SoldList({ title, rows, money }: { title: string; rows: SoldToday["garments"]; money?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{r.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                × {r.qty}
                {money && r.amount != null && <span className="ml-2 font-medium text-foreground">{inr(r.amount)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SoldTodayCard({ sold }: { sold: SoldToday }) {
  if (sold.garments.length === 0 && sold.products.length === 0 && sold.newCustomers + sold.repeatCustomers === 0) return null;
  return (
    <ReportCard className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShoppingBag className="size-4 text-muted-foreground" />
          <SectionLabel>Sold today</SectionLabel>
        </div>
        <div className="flex gap-2 text-[11px] font-medium">
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-950 dark:text-sky-300">{sold.newCustomers} new {sold.newCustomers === 1 ? "customer" : "customers"}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{sold.repeatCustomers} repeat</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SoldList title="Garments ordered" rows={sold.garments} />
        <SoldList title="Products invoiced" rows={sold.products} money />
      </div>
    </ReportCard>
  );
}

// ── Discounts ────────────────────────────────────────────────────────────

export function DiscountsCard({ discounts }: { discounts: DiscountSummary }) {
  if (discounts.total === 0 && discounts.loyaltyRedeemed === 0) return null;
  return (
    <ReportCard className={cn("space-y-3 p-4", discounts.flagged.length > 0 && "border-amber-500/40")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-muted-foreground" />
          <SectionLabel>Discounts given</SectionLabel>
        </div>
        <span className="text-sm font-semibold tabular-nums">{inr(discounts.total)}</span>
      </div>
      {discounts.byUser.length > 0 && (
        <ul className="space-y-1.5">
          {discounts.byUser.map((u) => (
            <li key={u.user} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{u.user}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {u.invoices} {u.invoices === 1 ? "invoice" : "invoices"} · <span className="font-medium text-foreground">{inr(u.amount)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {discounts.flagged.length > 0 && (
        <div className="space-y-1 rounded-lg bg-amber-50 p-2.5 dark:bg-amber-950/30">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3.5" /> Unusually large discounts
          </p>
          {discounts.flagged.map((f) => (
            <Link key={f.reference} href={f.href} className="flex items-center justify-between gap-2 text-sm hover:underline">
              <span className="truncate">
                {f.reference} <span className="text-xs text-muted-foreground">by {f.user}</span>
              </span>
              <span className="shrink-0 tabular-nums font-medium">
                {f.pct}% · {inr(f.amount)}
              </span>
            </Link>
          ))}
        </div>
      )}
      {discounts.loyaltyRedeemed > 0 && <p className="text-xs text-muted-foreground">Plus {inr(discounts.loyaltyRedeemed)} of loyalty points redeemed on stitching orders.</p>}
    </ReportCard>
  );
}

// ── Attendance ───────────────────────────────────────────────────────────

export function AttendanceCard({ board }: { board: AttendanceBoard }) {
  if (board.present.length + board.absent.length + board.onLeave.length + board.notMarked.length === 0) return null;
  const chips = (names: string[], tone: string) =>
    names.map((n) => (
      <span key={n} className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tone)}>
        {n}
      </span>
    ));
  return (
    <ReportCard className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-muted-foreground" />
        <SectionLabel>Attendance — {board.present.length} present</SectionLabel>
      </div>
      {board.present.length > 0 && (
        <ul className="divide-y">
          {board.present.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0 truncate font-medium">{p.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {p.checkIn ? fmtTime(p.checkIn) : "—"} → {p.checkOut ? fmtTime(p.checkOut) : <span className="text-amber-600">still in</span>}
                {p.hours != null && <span className="ml-2 font-medium text-foreground">{p.hours.toFixed(1)}h</span>}
                {p.overtime > 0 && <span className="ml-1 text-emerald-600">+{p.overtime.toFixed(1)}h OT</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {(board.absent.length > 0 || board.onLeave.length > 0 || board.notMarked.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {board.absent.length > 0 && <span className="text-muted-foreground">Absent:</span>}
          {chips(board.absent, "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300")}
          {board.onLeave.length > 0 && <span className="text-muted-foreground">On leave:</span>}
          {chips(board.onLeave, "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300")}
          {board.notMarked.length > 0 && <span className="text-muted-foreground">Not marked:</span>}
          {chips(board.notMarked, "bg-muted text-muted-foreground")}
        </div>
      )}
    </ReportCard>
  );
}

// ── Targets + best/worst days ────────────────────────────────────────────

export interface DayBookTargets {
  billed: number;
  collected: number;
}

function TargetBar({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const hit = target > 0 && value >= target;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{inr(value)}</span>
          <span className="text-muted-foreground"> / {inr(target)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", hit ? "bg-emerald-500" : "bg-sky-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Daily billed / collected targets with progress. Targets are shop-wide; admins set them. */
export function TargetCard({ billed, collected, targets, canEdit, onSave }: { billed: number; collected: number; targets: DayBookTargets; canEdit: boolean; onSave: (t: DayBookTargets) => void }) {
  const [editing, setEditing] = useState(false);
  const [b, setB] = useState(String(targets.billed || ""));
  const [c, setC] = useState(String(targets.collected || ""));
  const hasTargets = targets.billed > 0 || targets.collected > 0;
  if (!hasTargets && !canEdit) return null;
  return (
    <ReportCard className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-muted-foreground" />
          <SectionLabel>Daily target</SectionLabel>
        </div>
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground print:hidden">
            <Pencil className="size-3" /> {hasTargets ? "Edit" : "Set target"}
          </button>
        )}
      </div>
      {editing ? (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ billed: Math.max(0, parseFloat(b) || 0), collected: Math.max(0, parseFloat(c) || 0) });
            setEditing(false);
          }}
        >
          <Input type="number" inputMode="decimal" min={0} placeholder="Billed target ₹" value={b} onChange={(e) => setB(e.target.value)} className="h-10" />
          <Input type="number" inputMode="decimal" min={0} placeholder="Collection target ₹" value={c} onChange={(e) => setC(e.target.value)} className="h-10" />
          <Button type="submit">Save</Button>
        </form>
      ) : hasTargets ? (
        <div className="space-y-3">
          {targets.billed > 0 && <TargetBar label="Billed" value={billed} target={targets.billed} />}
          {targets.collected > 0 && <TargetBar label="Collected" value={collected} target={targets.collected} />}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Set a daily billing and collection target to see progress here.</p>
      )}
    </ReportCard>
  );
}

/** Best and slowest day so far this month, by total billed. */
export function BestWorstDays({ days, today }: { days: RangeDay[]; today: string }) {
  const past = days.filter((d) => d.date <= today && (d.totalBilled > 0 || d.payments > 0));
  if (past.length < 2) return null;
  const best = past.reduce((a, d) => (d.totalBilled > a.totalBilled ? d : a));
  const worst = past.reduce((a, d) => (d.totalBilled < a.totalBilled ? d : a));
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border bg-card px-4 py-2.5 text-sm">
      <span className="flex items-center gap-1.5">
        <TrendingUp className="size-4 text-emerald-600" />
        <span className="text-muted-foreground">Best day this month</span>
        <span className="font-semibold">{fmtDate(best.date)}</span>
        <span className="tabular-nums">{inr(best.totalBilled)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <TrendingDown className="size-4 text-red-600" />
        <span className="text-muted-foreground">Slowest</span>
        <span className="font-semibold">{fmtDate(worst.date)}</span>
        <span className="tabular-nums">{inr(worst.totalBilled)}</span>
      </span>
    </div>
  );
}
