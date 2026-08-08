"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { useExpense } from "@/hooks/use-expenses";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: expense, isLoading } = useExpense(id);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/expenses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Expenses
      </Link>
      <h1 className="text-xl font-semibold">Edit expense</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !expense ? <EmptyState icon={Wallet} title="Expense not found" /> : <ExpenseForm existing={expense} />}
    </div>
  );
}
