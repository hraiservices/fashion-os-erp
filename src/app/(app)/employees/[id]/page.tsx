"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Phone, Briefcase, ArrowLeft, Pencil, CalendarCheck, Wallet, Plus, Trash2 } from "lucide-react";
import { useEmployee } from "@/hooks/use-employees";
import { useAttendanceForEmployee } from "@/hooks/use-attendance";
import { useAdvancesForEmployee } from "@/hooks/use-payroll";
import { useAddAdvance, useDeleteAdvance } from "@/hooks/use-payroll-mutations";
import { useOrders } from "@/hooks/use-orders";
import { useCurrentUser } from "@/hooks/use-current-user";
import { computeCommission } from "@/lib/commission";
import { SALARY_TYPE_LABELS } from "@/lib/payroll";
import { inr, fmtDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ATTENDANCE_LABEL: Record<string, string> = {
  present: "Present",
  absent: "Absent",
  half_day: "Half day",
  leave: "Leave",
};

const ATTENDANCE_TONE: Record<string, string> = {
  present: "border-green-500/30 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  absent: "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  half_day: "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  leave: "border-border text-muted-foreground",
};

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: employee, isLoading } = useEmployee(id);
  const { data: attendance } = useAttendanceForEmployee(id);
  const { data: advances } = useAdvancesForEmployee(id);
  const { data: orders } = useOrders();
  const { data: user } = useCurrentUser();
  const addAdvance = useAddAdvance();
  const deleteAdvance = useDeleteAdvance();
  const canManagePayroll = !!user?.perms.managePayroll;

  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceNote, setAdvanceNote] = useState("");

  const commission = employee ? computeCommission(employee, orders || []) : null;
  const outstandingAdvances = (advances || []).filter((a) => !a.payslipId).reduce((s, a) => s + a.amount, 0);

  async function handleAddAdvance() {
    const amount = parseFloat(advanceAmount);
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    try {
      await addAdvance.mutateAsync({ employeeId: id, date: new Date().toISOString().slice(0, 10), amount, note: advanceNote, userEmail: user?.email });
      setAdvanceAmount("");
      setAdvanceNote("");
      toast.success("Advance recorded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record advance");
    }
  }

  async function handleDeleteAdvance(advanceId: string) {
    try {
      await deleteAdvance.mutateAsync({ id: advanceId });
      toast.success("Advance removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6">
        <EmptyState icon={Briefcase} title="Employee not found" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Employees
      </Link>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{employee.name}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {employee.role && (
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="size-3.5" /> {employee.role}
                </span>
              )}
              {employee.mobile && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" /> {employee.mobile}
                </span>
              )}
              {!employee.active && <Badge variant="outline">Inactive</Badge>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/employees/attendance" />}>
              <CalendarCheck className="size-4" /> Attendance
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/employees/${id}/edit`} />}>
              <Pencil className="size-4" /> Edit
            </Button>
          </div>
        </div>

        {canManagePayroll && (
          <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border">
            <div className="bg-card p-3 text-center">
              <p className="text-lg font-semibold tabular-nums">{inr(employee.salaryRate)}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{SALARY_TYPE_LABELS[employee.salaryType]} rate</p>
            </div>
            <div className="bg-card p-3 text-center">
              <p className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">{inr(outstandingAdvances)}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Advances pending</p>
            </div>
            <div className="bg-card p-3 text-center">
              <p className="text-lg font-semibold tabular-nums">{commission ? inr(commission.commission) : "—"}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Commission (all-time)</p>
            </div>
          </div>
        )}
      </div>

      {canManagePayroll && (
        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Advances</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b p-4">
            <Wallet className="size-4 shrink-0 text-muted-foreground" />
            <Input type="number" min={0} step="0.01" placeholder="Amount" className="w-32" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} />
            <Input placeholder="Note (optional)" className="flex-1 min-w-32" value={advanceNote} onChange={(e) => setAdvanceNote(e.target.value)} />
            <Button size="sm" onClick={handleAddAdvance} disabled={addAdvance.isPending}>
              <Plus className="size-3.5" /> Record advance
            </Button>
          </div>
          {!advances || advances.length === 0 ? (
            <EmptyState icon={Wallet} title="No advances recorded" className="border-0" />
          ) : (
            <ul className="divide-y">
              {advances.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{inr(a.amount)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtDate(a.date)} {a.note && `· ${a.note}`} {a.payslipId ? "· Deducted" : "· Pending"}
                    </p>
                  </div>
                  {!a.payslipId && (
                    <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteAdvance(a.id)} aria-label="Remove advance">
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Recent attendance</h2>
        </div>
        {!attendance || attendance.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="No attendance marked yet" className="border-0" />
        ) : (
          <ul className="divide-y">
            {attendance.slice(0, 30).map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm">{fmtDate(a.date)}</span>
                <Badge variant="outline" className={ATTENDANCE_TONE[a.status]}>
                  {ATTENDANCE_LABEL[a.status] || a.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
