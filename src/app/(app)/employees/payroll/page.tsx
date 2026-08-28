"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Wallet, Plus, ChevronRight } from "lucide-react";
import { usePayrollRuns } from "@/hooks/use-payroll";
import { useRunPayroll } from "@/hooks/use-payroll-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format";
import { DatePicker, toISODate } from "@/components/ui/date-picker";

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
  const { data: user } = useCurrentUser();
  const runPayroll = useRunPayroll();
  const canManagePayroll = !!user?.perms.managePayroll;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState(firstOfMonthISO());
  const [periodEnd, setPeriodEnd] = useState(todayISO());

  async function handleRunPayroll() {
    try {
      const runId = await runPayroll.mutateAsync({ periodStart, periodEnd, userEmail: user?.email });
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
        <EmptyState icon={Wallet} title="No access" description="Payroll is restricted to admins." />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Employees
      </Link>
      <PageHeader
        title="Payroll"
        description="Generate and track pay runs"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Run Payroll
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !runs || runs.length === 0 ? (
        <EmptyState icon={Wallet} title="No payroll runs yet" description="Click 'Run Payroll' to generate payslips for a pay period." />
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
