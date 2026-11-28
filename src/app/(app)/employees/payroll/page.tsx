"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, ChevronRight } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip, CartesianGrid } from "recharts";
import { LiteChartGate } from "@/components/ui/lite-chart-gate";
import { WalletDuotoneIcon } from "@/components/icons/duotone-icons";
import { usePayrollRuns, useAllPayslips, useBulkAdvanceCandidates } from "@/hooks/use-payroll";
import { useRunPayroll } from "@/hooks/use-payroll-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmtDate, fmtDateShort, inr } from "@/lib/format";
import { DatePicker, toISODate } from "@/components/ui/date-picker";
import { BackLink } from "@/components/ui/back-link";

function todayISO() {
  return toISODate(new Date());
}

function firstOfMonthISO() {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export default function PayrollRunsPage() {
  const router = useRouter();
  const { data: runs, isLoading } = usePayrollRuns();
  const { data: allPayslips } = useAllPayslips();
  const { data: advanceCandidates } = useBulkAdvanceCandidates();
  const { data: user } = useCurrentUser();
  const runPayroll = useRunPayroll();
  const canManagePayroll = !!user?.perms.managePayroll;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState(firstOfMonthISO());
  const [periodEnd, setPeriodEnd] = useState(todayISO());

  const netByRunId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of allPayslips || []) map.set(p.payrollRunId, (map.get(p.payrollRunId) || 0) + p.netPay);
    return map;
  }, [allPayslips]);

  const latestRun = runs?.[0];
  const latestRunNet = latestRun ? netByRunId.get(latestRun.id) || 0 : 0;
  const outstandingAdvances = (advanceCandidates || []).reduce((s, c) => s + c.outstandingAdvances, 0);
  const breakdown = useMemo(() => {
    const totals = { gross: 0, pieceRate: 0, overtime: 0 };
    for (const p of allPayslips || []) {
      if (latestRun && p.payrollRunId === latestRun.id) {
        totals.gross += p.grossPay;
        totals.pieceRate += p.pieceRatePay;
        totals.overtime += p.overtimePay;
      }
    }
    return totals;
  }, [allPayslips, latestRun]);

  // Last 6 runs, oldest first, net pay per run — the same "6 months of bars" pattern the vendor
  // purchases chart uses, just keyed by run instead of calendar month since runs aren't always
  // monthly.
  const trend = useMemo(() => {
    return (runs || [])
      .slice(0, 6)
      .slice()
      .reverse()
      .map((r) => ({ label: fmtDateShort(r.periodEnd), total: netByRunId.get(r.id) || 0 }));
  }, [runs, netByRunId]);

  async function handleRunPayroll() {
    try {
      const { runId } = await runPayroll.mutateAsync({ periodStart, periodEnd, userEmail: user?.email });
      toast.success("Payroll run generated");
      setDialogOpen(false);
      router.push(`/employees/payroll/${runId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to run payroll");
    }
  }

  if (!canManagePayroll) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState icon={WalletDuotoneIcon} title="No access" description="Payroll is restricted to admins." />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <BackLink href="/employees">Employees</BackLink>
      <PageHeader
        title="Payroll"
        description="Generate and track pay runs"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Run Payroll
          </Button>
        }
      />

      {!isLoading && runs && runs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border lg:col-span-5 lg:grid-cols-1">
            <div className="bg-card p-3 text-center sm:p-4">
              <p className="break-words text-lg font-semibold tabular-nums">{inr(latestRunNet)}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Latest run — net pay{latestRun ? ` (${fmtDate(latestRun.periodEnd)})` : ""}</p>
            </div>
            <div className="bg-card p-3 text-center sm:p-4">
              <p className="break-words text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">{inr(outstandingAdvances)}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding advances (shop-wide)</p>
            </div>
            {latestRun && (
              <div className="col-span-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-card p-3 text-center text-xs text-muted-foreground sm:p-4 lg:col-span-1">
                <span>Gross {inr(breakdown.gross)}</span>
                <span>Piece-rate {inr(breakdown.pieceRate)}</span>
                <span>Overtime {inr(breakdown.overtime)}</span>
              </div>
            )}
          </div>
          {trend.some((t) => t.total > 0) && (
            <div className="rounded-xl border bg-card p-4 lg:col-span-7">
              <h2 className="mb-2 text-sm font-semibold">Net pay — last {trend.length} runs</h2>
              <div className="h-32">
                <LiteChartGate>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                      <Tooltip
                        formatter={(v) => [inr(Number(v)), "Net pay"]}
                        contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
                      />
                      <Bar dataKey="total" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </LiteChartGate>
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !runs || runs.length === 0 ? (
        <EmptyState icon={WalletDuotoneIcon} title="No payroll runs yet" description="Click 'Run Payroll' to generate payslips for a pay period." />
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <Link key={r.id} href={`/employees/payroll/${r.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
                </p>
                {r.notes && <p className="truncate text-xs text-muted-foreground">{r.notes}</p>}
              </div>
              <Badge variant={r.status === "finalized" ? "secondary" : "outline"}>{r.status === "finalized" ? "Finalized" : "Draft"}</Badge>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Run Payroll</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Period start</label>
              <DatePicker value={periodStart} onChange={setPeriodStart} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Period end</label>
              <DatePicker value={periodEnd} onChange={setPeriodEnd} />
            </div>
            <p className="text-xs text-muted-foreground">Generates a draft payslip for every active employee based on their attendance in this period.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRunPayroll} disabled={runPayroll.isPending}>
              {runPayroll.isPending ? "Generating…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
