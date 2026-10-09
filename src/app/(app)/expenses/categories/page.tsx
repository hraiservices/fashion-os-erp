"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpenseCategoriesSection } from "@/components/expenses/expense-categories-section";
import { BackLink } from "@/components/ui/back-link";

export default function ExpenseCategoriesPage() {
  const { data: user, isLoading } = useCurrentUser();
  const canManageShop = !user?.restricted;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <BackLink href="/expenses">Expenses</BackLink>
      <PageHeader title="Expense Categories" description="Manage the categories available when logging an expense" />
      {isLoading ? <Skeleton className="h-48 w-full" /> : canManageShop ? <ExpenseCategoriesSection /> : <p className="text-sm text-muted-foreground">You don&apos;t have access to manage expense categories.</p>}
    </div>
  );
}
