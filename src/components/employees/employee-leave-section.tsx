"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Plus, Umbrella } from "lucide-react";
import { useEmployeeLeaveBalance, useAdjustLeaveBalance } from "@/hooks/use-employee-leave-balance";
import { useLeaveRequests } from "@/hooks/use-leave-requests";
import { useActiveLeaveTypes } from "@/hooks/use-leave-types";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate } from "@/lib/format";
import type { LeaveRequestStatus } from "@/lib/types";

const STATUS_TONE: Record<LeaveRequestStatus, string> = {
  pending: "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  approved: "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  cancelled: "border-border text-muted-foreground",
};

function AdjustBalanceForm({ employeeId, onDone }: { employeeId: string; onDone: () => void }) {
  const { data: leaveTypes } = useActiveLeaveTypes();
  const adjust = useAdjustLeaveBalance(employeeId);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [days, setDays] = useState(0);
  const [reason, setReason] = useState("");

  async function handleSave() {
    if (!leaveTypeId) return toast.error("Choose a leave type");
    if (!days) return toast.error("Enter a non-zero adjustment");
    if (!reason.trim()) return toast.error("A reason is required");
    try {
      await adjust.mutateAsync({ leaveTypeId, year: new Date().getFullYear(), days, reason: reason.trim() });
      toast.success("Balance adjusted");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to adjust");
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Leave type</Label>
          <Select value={leaveTypeId} onValueChange={(v) => v && setLeaveTypeId(v)}>
            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              {(leaveTypes || []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Days (+ to add, − to subtract)</Label>
          <NumberInput step={0.5} className="h-9" value={days} onChange={setDays} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Reason</Label>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why is this balance being adjusted?" />
      </div>
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={adjust.isPending}>Save adjustment</Button>
      </div>
    </div>
  );
}

export function EmployeeLeaveSection({ employeeId }: { employeeId: string }) {
  const { data, isLoading } = useEmployeeLeaveBalance(employeeId);
  const { data: requests } = useLeaveRequests({ employeeId });
  const { data: leaveTypes } = useActiveLeaveTypes();
  const [adjusting, setAdjusting] = useState(false);

  const leaveTypeName = (id: string) => leaveTypes?.find((t) => t.id === id)?.name || "—";

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Leave</h2>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAdjusting((v) => !v)}>
          <Plus className="size-3.5" /> Adjust balance
        </Button>
      </div>

      <div className="space-y-3 p-4">
        {adjusting && <AdjustBalanceForm employeeId={employeeId} onDone={() => setAdjusting(false)} />}

        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !data || data.balances.length === 0 ? (
          <EmptyState icon={Umbrella} title="No leave types configured" description="Add leave types under Settings → Leave Policy." className="border-0" />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.balances.map((b) => (
              <div key={b.leaveTypeId} className="rounded-lg border p-2.5 text-center">
                <p className="text-lg font-semibold tabular-nums">{b.remaining}</p>
                <p className="truncate text-[11px] text-muted-foreground">{b.leaveTypeName}</p>
                <p className="text-[10px] text-muted-foreground">of {b.allocated + b.carriedForward}</p>
              </div>
            ))}
          </div>
        )}

        <div className="border-t pt-3">
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Request history</h3>
          {!requests || requests.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No leave requests yet" className="border-0 py-4" />
          ) : (
            <ul className="space-y-1.5">
              {requests.slice(0, 10).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">
                    {leaveTypeName(r.leaveTypeId)} · {fmtDate(r.fromDate)}{r.toDate !== r.fromDate ? ` – ${fmtDate(r.toDate)}` : ""} ({r.days}d)
                  </span>
                  <Badge variant="outline" className={STATUS_TONE[r.status]}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
