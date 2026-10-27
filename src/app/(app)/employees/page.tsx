"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, UserCog, Pencil, Trash2, ChevronRight, CalendarCheck, Link2, Wallet } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useUserRoles } from "@/hooks/use-user-roles";
import { useDeleteEmployee } from "@/hooks/use-employee-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRowSelection } from "@/hooks/use-row-selection";
import { PageHeader } from "@/components/ui/page-header";
import { NewButton } from "@/components/ui/new-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
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

function EmployeesPageContent() {
  const router = useRouter();
  const { data: employees, isLoading } = useEmployees();
  const { data: user } = useCurrentUser();
  const canSeeLinkedUsers = !!user?.perms.manageUsers;
  const { data: userRoles } = useUserRoles(canSeeLinkedUsers);
  const deleteEmployee = useDeleteEmployee();
  const [search, setSearch] = useState("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const canManage = !!user?.perms.manageEmployees;
  const canManagePayroll = !!user?.perms.managePayroll;
  const linkedEmailByEmployeeId = new Map((userRoles || []).filter((r) => r.linked_employee_id).map((r) => [r.linked_employee_id as string, r.email]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employees || []).filter((e) => !q || e.name.toLowerCase().includes(q) || e.mobile.includes(q) || e.role.toLowerCase().includes(q));
  }, [employees, search]);

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

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" enterKeyHint="search" placeholder="Search name, mobile or role…" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search employees" />
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
        <div className="space-y-2">
          {canManage && filtered.length > 0 && (
            <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Checkbox checked={selection.allSelected} onChange={selection.toggleAll} aria-label="Select all employees" />
              Select all
            </label>
          )}
          {filtered.map((e) => (
            <div key={e.id} className="flex items-center gap-2 rounded-xl border bg-card p-3 hover:bg-muted/40">
              {canManage && <Checkbox checked={selection.selected.has(e.id)} onChange={() => selection.toggle(e.id)} aria-label={`Select ${e.name}`} />}
              <Link href={`/employees/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{e.name}</p>
                <p className="truncate text-xs text-muted-foreground">{[e.role, e.mobile].filter(Boolean).join(" · ") || "—"}</p>
              </div>
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
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
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
              )}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </div>
          ))}
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
