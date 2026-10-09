"use client";

import { ExpenseImportWizard } from "@/components/expenses/expense-import-wizard";
import { BackLink } from "@/components/ui/back-link";

export default function ImportExpensesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <BackLink href="/expenses">Expenses</BackLink>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import expenses</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one expense entry.</p>
      </div>
      <ExpenseImportWizard />
    </div>
  );
}
