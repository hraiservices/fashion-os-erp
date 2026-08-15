"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, CalendarClock, Check, X } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useActiveLeaveTypes } from "@/hooks/use-leave-types";
import { useLeaveRequests, useApproveLeaveRequest } from "@/hooks/use-leave-requests";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RejectLeaveDialog } from "@/components/employees/reject-leave-dialog";
import { fmtDate } from "@/lib/format";
import type { LeaveRequest, LeaveRequestStatus } from "@/lib/types";

const STATUS_TONE: Record<LeaveRequestStatus, string> = {
  pending: "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  approved: "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  rejected: "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  cancelled: "border-border text-muted-foreground",
};

function RequestCard({
  request,
  employeeName,
  leaveTypeName,
  actions,
}: {
  request: LeaveRequest;
  employeeName: string;
  leaveTypeName: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate font-medium">{employeeName}</p>
          <span className={`rounded-full border px-1.5 py-0 text-[10px] font-medium ${STATUS_TONE[request.status]}`}>{request.status}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {leaveTypeName} · {fmtDate(request.fromDate)}{request.toDate !== request.fromDate ? ` – ${fmtDate(request.toDate)}` : ""} · {request.days}d
        </p>
        {request.reason && <p className="mt-1 text-xs text-muted-foreground">&ldquo;{request.reason}&rdquo;</p>}
        {request.status === "rejected" && request.rejectionReason && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">Rejected: {request.rejectionReason}</p>
        )}
        <p className="mt-0.5 text-[11px] text-muted-foreground">Requested {fmtDate(request.requestedAt.slice(0, 10))}</p>
      </div>
      {actions}
    </div>
  );
}

function PendingApprovals() {
  const { data: employees } = useEmployees();
  const { data: leaveTypes } = useActiveLeaveTypes();
  const { data: requests, isLoading } = useLeaveRequests({ status: "pending" });
  const approve = useApproveLeaveRequest();
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const employeeName = (id: string) => employees?.find((e) => e.id === id)?.name || "—";
  const leaveTypeName = (id: string) => leaveTypes?.find((t) => t.id === id)?.name || "—";

  async function handleApprove(id: string) {
    try {
      const res = await approve.mutateAsync(id);
      if (res.skippedDates.length > 0) {
        toast.success(`Approved — ${res.skippedDates.length} date(s) already had attendance and were left unchanged`);
      } else {
        toast.success("Leave request approved");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  if (!requests || requests.length === 0) {
    return <EmptyState icon={CalendarClock} title="No pending requests" description="New leave applications will show up here for approval." />;
  }

  return (
    <>
      <div className="space-y-2">
        {requests.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            employeeName={employeeName(r.employeeId)}
            leaveTypeName={leaveTypeName(r.leaveTypeId)}
            actions={
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="outline" className="gap-1.5" disabled={approve.isPending} onClick={() => handleApprove(r.id)}>
                  <Check className="size-3.5" /> Approve
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setRejectingId(r.id)}>
                  <X className="size-3.5" /> Reject
                </Button>
              </div>
            }
          />
        ))}
      </div>
      <RejectLeaveDialog requestId={rejectingId} open={!!rejectingId} onOpenChange={(v) => !v && setRejectingId(null)} />
    </>
  );
}

const ALL_EMPLOYEES = "__all__";
const ALL_STATUSES = "__all__";

function AllRequests() {
  const { data: employees } = useEmployees();
  const { data: leaveTypes } = useActiveLeaveTypes();
  const [employeeFilter, setEmployeeFilter] = useState(ALL_EMPLOYEES);
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const { data: requests, isLoading } = useLeaveRequests({
    employeeId: employeeFilter === ALL_EMPLOYEES ? undefined : employeeFilter,
    status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
  });

  const employeeName = (id: string) => employees?.find((e) => e.id === id)?.name || "—";
  const leaveTypeName = (id: string) => leaveTypes?.find((t) => t.id === id)?.name || "—";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={employeeFilter} onValueChange={(v) => v && setEmployeeFilter(v)}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_EMPLOYEES}>All employees</SelectItem>
            {(employees || []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !requests || requests.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No leave requests" description="Requests matching this filter will show up here." />
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} employeeName={employeeName(r.employeeId)} leaveTypeName={leaveTypeName(r.leaveTypeId)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function EmployeeLeavePage() {
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const { data: pendingCount } = useLeaveRequests({ status: "pending" });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Employees
      </Link>
      <PageHeader title="Leave" description="Review and approve employee leave requests" />

      <Tabs value={tab} onValueChange={(v) => v && setTab(v as "pending" | "all")}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            Pending approvals
            {!!pendingCount?.length && <Badge variant="secondary" className="h-4 min-w-4 px-1">{pendingCount.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="all">All requests</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "pending" ? <PendingApprovals /> : <AllRequests />}
    </div>
  );
}
