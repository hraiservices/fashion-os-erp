"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, UserCog, Pencil, Trash2, ChevronRight, CalendarCheck, Link2 } from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useUserRoles } from "@/hooks/use-user-roles";
import { useDeleteEmployee } from "@/hooks/use-employee-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
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

  const canManage = !!user?.perms.manageEmployees;
  const linkedEmailByEmployeeId = new Map((userRoles || []).filter((r) => r.linked_employee_id).map((r) => [r.linked_employee_id as string, r.email]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employees || []).filter((e) => !q || e.name.toLowerCase().includes(q) || e.mobile.includes(q) || e.role.toLowerCase().includes(q));
  }, [employees, search]);

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
            {canManage && (
              <Button nativeButton={false} render={<Link href="/employees/new" />}>
                <Plus className="size-4" /> Add employee
              </Button>
            )}
          </>
        }
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search name, mobile or role…" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search employees" />
      </div>

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
              <Button nativeButton={false} render={<Link href="/employees/new" />}>
                <Plus className="size-4" /> Add employee
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <Link key={e.id} href={`/employees/${e.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40">
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
                  <Link2 className="size-3" /> Linked
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
          ))}
        </div>
      )}
    </div>
  );
}

export default function EmployeesPage() {
  return <EmployeesPageContent />;
}
