"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Wallet, Banknote } from "lucide-react";
import { useBulkAdvanceCandidates } from "@/hooks/use-payroll";
import { useAddBulkAdvances } from "@/hooks/use-payroll-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { inr } from "@/lib/format";
import { DatePicker, toISODate } from "@/components/ui/date-picker";

function todayISO() {
  return toISODate(new Date());
}

/**
 * Weekly Advances: pay out several employees' advances in one sitting instead of opening each
 * one's own page in turn — built for the Saturday round most shops actually run this on, but
 * works for any date. Type an amount next to whoever's taking one today and submit once; rows
 * left blank are simply skipped, nothing is required for everyone.
 */
export default function WeeklyAdvancesPage() {
  const { data: user } = useCurrentUser();
  const { data: employees, isLoading } = useBulkAdvanceCandidates();
  const addBulkAdvances = useAddBulkAdvances();
  const canManagePayroll = !!user?.perms.managePayroll;

  const [date, setDate] = useState(todayISO());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  if (!canManagePayroll) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={Wallet} title="No access" description="Advances are restricted to admins." />
      </div>
    );
  }

  const entries = Object.entries(amounts)
    .map(([employeeId, raw]) => ({ employeeId, amount: parseFloat(raw) }))
    .filter((e) => e.amount > 0);
  const total = entries.reduce((s, e) => s + e.amount, 0);

  async function handleSubmit() {
    if (entries.length === 0) return toast.error("Enter an amount for at least one employee");
    try {
      const result = await addBulkAdvances.mutateAsync({
        date,
        entries: entries.map((e) => ({ employeeId: e.employeeId, amount: e.amount, note })),
      });
      const nameOf = (id: string) => employees?.find((e) => e.id === id)?.name || id;
      if (result.skipped.length === 0) {
        toast.success(`Recorded ${result.inserted} advance${result.inserted === 1 ? "" : "s"}`);
        setAmounts({});
        setNote("");
      } else {
        toast.warning(
          `Recorded ${result.inserted} of ${entries.length} — skipped ${result.skipped.map((s) => `${nameOf(s.employeeId)} (${s.reason})`).join(", ")}`,
          { duration: 8000 }
        );
        // Clear only what actually went through, so a skipped row's amount stays on screen to
        // fix and resubmit rather than having to remember and retype it.
        const skippedIds = new Set(result.skipped.map((s) => s.employeeId));
        setAmounts((prev) => {
          const next: Record<string, string> = {};
          for (const [id, raw] of Object.entries(prev)) if (skippedIds.has(id)) next[id] = raw;
          return next;
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record advances");
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Employees
      </Link>
      <PageHeader
        title="Weekly Advances"
        description="Pay out several employees' advances at once"
        actions={
          <Button onClick={handleSubmit} disabled={addBulkAdvances.isPending || entries.length === 0}>
            <Banknote className="size-4" />
            {addBulkAdvances.isPending ? "Recording…" : entries.length > 0 ? `Record ${entries.length} · ${inr(total)}` : "Record advances"}
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Date</label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div className="min-w-48 flex-1 space-y-1.5">
          <label className="text-xs font-medium">Note (optional, applies to every row below)</label>
          <Input placeholder="e.g. Saturday advance" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !employees || employees.length === 0 ? (
        <EmptyState icon={Wallet} title="No active employees" />
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {employees.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-40 flex-1">
                <p className="font-medium">{e.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {e.role}
                  {e.pieceRateEligible && <Badge variant="outline" className="text-[10px]">Piece-rate</Badge>}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {e.outstandingAdvances > 0 && (
                  <p>
                    <span className="text-amber-700 dark:text-amber-400">{inr(e.outstandingAdvances)}</span> pending
                  </p>
                )}
                {e.pieceRateEligible && <p>Up to {inr(e.pieceRateCap ?? 0)} available</p>}
              </div>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="Amount"
                className="w-32 shrink-0"
                value={amounts[e.id] ?? ""}
                onChange={(ev) => setAmounts((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                aria-label={`Advance amount for ${e.name}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
