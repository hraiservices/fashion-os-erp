"use client";

import { use } from "react";
import { Wallet } from "lucide-react";
import { useExpense } from "@/hooks/use-expenses";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: expense, isLoading } = useExpense(id);

  if (isLoading) return <Skeleton className="h-screen w-full" />;
  if (!expense) return <EmptyState icon={Wallet} title="Expense not found" />;
  return <ExpenseForm existing={expense} />;
}
