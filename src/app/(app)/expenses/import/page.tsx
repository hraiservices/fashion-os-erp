"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExpenseImportWizard } from "@/components/expenses/expense-import-wizard";

export default function ImportExpensesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/expenses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Expenses
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import expenses</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one expense entry.</p>
      </div>
      <ExpenseImportWizard />
    </div>
  );
}
