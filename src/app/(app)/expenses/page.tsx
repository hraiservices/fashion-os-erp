"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useExpenses, useDeleteExpense, useBulkDeleteExpenses } from "@/hooks/use-expenses";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRowSelection } from "@/hooks/use-row-selection";
import { inr, fmtDateShort } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";

function ExpensesPageContent() {
  const { data: expenses, isLoading } = useExpenses();
  const { data: user } = useCurrentUser();
  const deleteExpense = useDeleteExpense();
  const bulkDeleteExpenses = useBulkDeleteExpenses();
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const canAdd = user?.role === "admin" || user?.role === "manager";
  const selection = useRowSelection((expenses || []).map((e) => e.id));

  async function handleDelete(id: string) {
    try {
      await deleteExpense.mutateAsync(id);
      toast.success("Expense deleted");
    } catch {
      toast.error("Failed to delete expense");
    }
  }

  async function bulkDelete() {
    setBulkDeleteOpen(false);
    try {
      await bulkDeleteExpenses.mutateAsync(Array.from(selection.selected));
      toast.success(`${selection.count} expense(s) deleted`);
      selection.clear();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete expenses");
    }
  }

  const total = (expenses || []).reduce((s, e) => s + e.amount, 0);

  const byCategory: Record<string, number> = {};
  (expenses || []).forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  });
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Expenses"
        description="Track your shop's operating costs"
        actions={
          canAdd && (
            <Button nativeButton={false} render={<Link href="/expenses/new" />}>
              <Plus className="size-4" /> Add Expense
            </Button>
          )
        }
      />

      {!isLoading && (expenses?.length ?? 0) > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Expenses</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{inr(total)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{expenses!.length} entries</p>
          </div>
          {topCategories.slice(0, 3).map(([cat, amt]) => (
            <div key={cat} className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{cat}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{inr(amt)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{total > 0 ? Math.round((amt / total) * 100) : 0}% of total</p>
            </div>
          ))}
        </div>
      )}

      {canAdd && selection.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selection.count} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)} disabled={bulkDeleteExpenses.isPending}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={selection.clear} disabled={bulkDeleteExpenses.isPending}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">All Expenses</h2>
          {total > 0 && <span className="text-sm font-semibold tabular-nums">{inr(total)}</span>}
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !expenses?.length ? (
          <EmptyState icon={Wallet} title="No expenses yet" description="Add your first expense to start tracking costs." className="border-0" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {canAdd && (
                    <th className="w-8 px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selection.allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = selection.someSelected;
                        }}
                        onChange={selection.toggleAll}
                        aria-label="Select all expenses"
                      />
                    </th>
                  )}
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Description</th>
                  <th className="px-4 py-2.5 font-medium">Method</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  {canAdd && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {expenses.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-muted/30">
                    {canAdd && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selection.selected.has(e.id)} onChange={() => selection.toggle(e.id)} aria-label={`Select expense on ${fmtDateShort(e.date)}`} />
                      </td>
                    )}
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{fmtDateShort(e.date)}</td>
                    <td className="px-4 py-3 font-medium">{e.category}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.description || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.payMethod}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{inr(e.amount)}</td>
                    {canAdd && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-7 text-muted-foreground"
                            nativeButton={false}
                            render={<Link href={`/expenses/${e.id}/edit`} />}
                            aria-label="Edit expense"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(e.id)}
                            disabled={deleteExpense.isPending}
                            aria-label="Delete expense"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} expense(s)?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete} disabled={bulkDeleteExpenses.isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function ExpensesPage() {
  return <ExpensesPageContent />;
}
