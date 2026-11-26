"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, UserCog, Pencil, Trash2, ChevronRight, CalendarCheck, Link2, Wallet, LayoutGrid, List as ListIcon } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useUserRoles } from "@/hooks/use-user-roles";
import { useDeleteEmployee } from "@/hooks/use-employee-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRowSelection } from "@/hooks/use-row-selection";
import { useAttendanceForDate } from "@/hooks/use-attendance";
import { PageHeader } from "@/components/ui/page-header";
import { NewButton } from "@/components/ui/new-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_TONE, roleAvatarTone } from "@/lib/attendance-colors";
import { TONES } from "@/lib/ui-tones";
import { toISODate } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Employee } from "@/lib/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

type ViewMode = "grid" | "list";

function EmployeesPageContent() {
  const router = useRouter();
  const { data: employees, isLoading } = useEmployees();
  const { data: user } = useCurrentUser();
  const canSeeLinkedUsers = !!user?.perms.manageUsers;
  const { data: userRoles } = useUserRoles(canSeeLinkedUsers);
  const { data: todayAttendance } = useAttendanceForDate(toISODate(new Date()));
  const deleteEmployee = useDeleteEmployee();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const canManage = !!user?.perms.manageEmployees;
  const canManagePayroll = !!user?.perms.managePayroll;
  const linkedEmailByEmployeeId = new Map((userRoles || []).filter((r) => r.linked_employee_id).map((r) => [r.linked_employee_id as string, r.email]));
  const attendanceByEmployeeId = new Map((todayAttendance || []).map((a) => [a.employeeId, a]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employees || []).filter((e) => !q || e.name.toLowerCase().includes(q) || e.mobile.includes(q) || e.role.toLowerCase().includes(q));
  }, [employees, search]);

  // Role as the grouping dimension — the only one on record (there's no separate department
  // field) — so the grid reads as "Tailors / Sales / Management" instead of one undifferentiated
  // wall of cards, the same way Zoho/Odoo's employee directories default to grouped cards.
  const grouped = useMemo(() => {
    const groups = new Map<string, Employee[]>();
    for (const e of filtered) {
      const key = e.role || "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const selection = useRowSelection(filtered.map((e) => e.id));
  const selectedEmployees = filtered.filter((e) => selection.selected.has(e.id));

  function openEdit(e: Employee, ev: React.MouseEvent) {
    ev.preventDefault();
    router.push(`/employees/${e.id}/edit`);
  }

  async function handleDelete(e: Employee) {
    try {
      await deleteEmployee.mutateAsync({ id: e.id, name: e.name, userEmail: user?.email });
      toast.success(`${e.name} deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function bulkDelete() {
    setBulkBusy(true);
    setBulkDeleteOpen(false);
    let failed = 0;
    for (const e of selectedEmployees) {
      try {
        await deleteEmployee.mutateAsync({ id: e.id, name: e.name, userEmail: user?.email });
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    selection.clear();
    if (failed) toast.error(`${selectedEmployees.length - failed} deleted, ${failed} failed`);
    else toast.success(`${selectedEmployees.length} employee(s) deleted`);
  }

  function statusBadge(e: Employee) {
    if (!e.active) return null;
    const a = attendanceByEmployeeId.get(e.id);
    if (!a) return <Badge variant="outline" className="shrink-0 text-muted-foreground">Not marked</Badge>;
    const tone = TONES[ATTENDANCE_STATUS_TONE[a.status]];
    return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", tone.idle)}>{ATTENDANCE_STATUS_LABELS[a.status]}</span>;
  }

  function EditDeleteButtons({ e }: { e: Employee }) {
    if (!canManage) return null;
    return (
      <div className="flex shrink-0 items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
        <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" onClick={(ev) => openEdit(e, ev)} aria-label={`Edit ${e.name}`}>
          <Pencil className="size-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" aria-label={`Delete ${e.name}`} onClick={(ev) => ev.preventDefault()}>
                <Trash2 className="size-3.5" />
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {e.name}?</AlertDialogTitle>
              <AlertDialogDescription>This removes their attendance history too. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDelete(e)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Employees"
        description={`${filtered.length} of ${employees?.length ?? 0} employees`}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/employees/attendance" />}>
              <CalendarCheck className="size-4" /> Attendance
            </Button>
            {canManagePayroll && (
              <Button variant="outline" nativeButton={false} render={<Link href="/employees/advances" />}>
                <Wallet className="size-4" /> Advances
              </Button>
            )}
            {canManage && (
              <NewButton href="/employees/new" ariaLabel="Add employee" />
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" enterKeyHint="search" placeholder="Search name, mobile or role…" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search employees" />
        </div>
        <SegmentedToggle
          ariaLabel="View"
          value={view}
          onChange={setView}
          options={[
            { value: "grid", label: "Cards", icon: LayoutGrid },
            { value: "list", label: "List", icon: ListIcon },
          ]}
        />
      </div>

      {canManage && !isLoading && selection.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selection.count} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" className="h-11 px-4 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]" onClick={() => setBulkDeleteOpen(true)} disabled={bulkBusy}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
            <Button variant="ghost" size="sm" className="h-11 px-4 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]" onClick={selection.clear} disabled={bulkBusy}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No employees yet"
          description="Add your tailors, salespeople and other staff — used for the Tailor dropdown, attendance and commission."
          action={
            canManage && (
              <NewButton href="/employees/new" ariaLabel="Add employee" />
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {canManage && filtered.length > 0 && (
            <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Checkbox checked={selection.allSelected} onChange={selection.toggleAll} aria-label="Select all employees" />
              Select all
            </label>
          )}

          {view === "list" ? (
            <div className="space-y-2">
              {filtered.map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded-xl border bg-card p-3 hover:bg-muted/40">
                  {canManage && <Checkbox checked={selection.selected.has(e.id)} onChange={() => selection.toggle(e.id)} aria-label={`Select ${e.name}`} />}
                  <Link href={`/employees/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.name || linkedEmailByEmployeeId.get(e.id) || "Unnamed staff member"}</p>
                    <p className="truncate text-xs text-muted-foreground">{[e.role, e.mobile].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  {statusBadge(e)}
                  {!e.active && (
                    <Badge variant="outline" className="shrink-0 text-muted-foreground">
                      Inactive
                    </Badge>
                  )}
                  {canSeeLinkedUsers && linkedEmailByEmployeeId.has(e.id) && (
                    <Badge variant="outline" className="shrink-0 gap-1 text-emerald-600 dark:text-emerald-400" title={`Login: ${linkedEmailByEmployeeId.get(e.id)}`}>
                      <Link2 className="size-3" /> Dashboard access
                    </Badge>
                  )}
                  <EditDeleteButtons e={e} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([role, roleEmployees]) => (
                <div key={role} className="space-y-2">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {role} <span className="font-normal normal-case">({roleEmployees.length})</span>
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {roleEmployees.map((e) => (
                      <Link
                        key={e.id}
                        href={`/employees/${e.id}`}
                        className="relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
                      >
                        {canManage && (
                          <div className="absolute left-3 top-3" onClick={(ev) => ev.preventDefault()}>
                            <Checkbox checked={selection.selected.has(e.id)} onChange={() => selection.toggle(e.id)} aria-label={`Select ${e.name}`} />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <Avatar size="lg" className="shrink-0">
                            {e.photoUrl && <AvatarImage src={e.photoUrl} alt={e.name} />}
                            <AvatarFallback className={cn("font-semibold", TONES[roleAvatarTone(e.role)].idle)}>{initials(e.name)}</AvatarFallback>
                          </Avatar>
                          <EditDeleteButtons e={e} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{e.name || linkedEmailByEmployeeId.get(e.id) || "Unnamed staff member"}</p>
                          <p className="truncate text-xs text-muted-foreground">{e.mobile || "—"}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {statusBadge(e)}
                          {!e.active && (
                            <Badge variant="outline" className="shrink-0 text-muted-foreground">
                              Inactive
                            </Badge>
                          )}
                          {canSeeLinkedUsers && linkedEmailByEmployeeId.has(e.id) && (
                            <Badge variant="outline" className="shrink-0 gap-1 text-emerald-600 dark:text-emerald-400" title={`Login: ${linkedEmailByEmployeeId.get(e.id)}`}>
                              <Link2 className="size-3" /> Access
                            </Badge>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} employee(s)?</AlertDialogTitle>
            <AlertDialogDescription>This removes their attendance history too. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function EmployeesPage() {
  return <EmployeesPageContent />;
}
