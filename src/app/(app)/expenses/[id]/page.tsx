"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, CreditCard, FileText, Pencil, Trash2, User } from "lucide-react";
import { WalletDuotoneIcon } from "@/components/icons/duotone-icons";
import { useExpense, useExpenses, useDeleteExpense } from "@/hooks/use-expenses";
import { useEmployees } from "@/hooks/use-employees";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr, fmtDate } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/ui/back-link";
import { DetailSidebarList } from "@/components/ui/detail-sidebar-list";
import { RecordPrevNext } from "@/components/ui/record-prev-next";
import { CustomerLink } from "@/components/crm/customer-link";
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

/** Read-only expense detail view — there was previously no such page, only the list and the Edit
 *  form, so there was nowhere to put a Zoho-style "all expenses" sidebar. This exists primarily
 *  to host that sidebar; editing still happens on the existing /expenses/[id]/edit form. */
export default function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: expense, isLoading } = useExpense(id);
  const { data: allExpenses } = useExpenses();
  const { data: employees } = useEmployees();
  const { data: user } = useCurrentUser();
  const deleteExpense = useDeleteExpense();

  const canManage = user?.role === "admin" || user?.role === "manager";
  const employeeNameById = new Map((employees || []).map((e) => [e.id, e.name]));

  const sidebarItems = (allExpenses || [])
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((e) => ({
      id: e.id,
      title: e.category,
      subtitle: `${fmtDate(e.date)}${e.description ? ` · ${e.description}` : ""}`,
      amountLabel: inr(e.amount),
      amountTone: "plain" as const,
      href: `/expenses/${e.id}`,
    }));

  async function handleDelete() {
    if (!expense) return;
    try {
      await deleteExpense.mutateAsync(expense.id);
      toast.success("Expense deleted");
      router.push("/expenses");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete expense");
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

  if (!expense) {
    return (
      <div className="mx-auto flex max-w-[88rem] items-start gap-4 p-4 sm:p-6">
        <DetailSidebarList items={sidebarItems} activeId={id} searchPlaceholder="Search expenses…" emptyLabel="No expenses yet" />
        <div className="min-w-0 flex-1 p-2">
          <EmptyState icon={WalletDuotoneIcon} title="Expense not found" />
        </div>
      </div>
    );
  }

  const linkedName = expense.employeeId ? employeeNameById.get(expense.employeeId) || "—" : expense.customerName || null;

  return (
    <div className="mx-auto flex max-w-[88rem] items-start gap-4 p-4 sm:p-6">
      <DetailSidebarList items={sidebarItems} activeId={id} searchPlaceholder="Search expenses…" emptyLabel="No expenses yet" />
      <div className="min-w-0 max-w-3xl flex-1 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <BackLink href="/expenses">Expenses</BackLink>
          <RecordPrevNext items={sidebarItems} activeId={id} />
        </div>

        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{expense.category}</h1>
              {expense.description && <p className="mt-0.5 text-sm text-muted-foreground">{expense.description}</p>}
            </div>
            <p className="shrink-0 text-xl font-bold tabular-nums">{inr(expense.amount)}</p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
              <span>{fmtDate(expense.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CreditCard className="size-4 shrink-0 text-muted-foreground" />
              <span>{expense.payMethod}</span>
            </div>
            {linkedName && (
              <div className="flex items-center gap-2 text-sm">
                <User className="size-4 shrink-0 text-muted-foreground" />
                <span>{linkedName}</span>
                {expense.customerMobile && <CustomerLink mobile={expense.customerMobile} label={linkedName} />}
              </div>
            )}
            {expense.createdBy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="size-4 shrink-0" />
                <span>Recorded by {expense.createdBy}</span>
              </div>
            )}
          </div>

          {canManage && (
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/expenses/${id}/edit`} />}>
                <Pencil className="size-3.5" /> Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
                    <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
