import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExpenseForm } from "@/components/expenses/expense-form";

export default function NewExpensePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/expenses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Expenses
      </Link>
      <h1 className="text-xl font-semibold">New expense</h1>
      <ExpenseForm />
    </div>
  );
}
