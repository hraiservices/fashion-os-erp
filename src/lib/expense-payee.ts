import type { Expense } from "./types";

type PayeeFields = Pick<Expense, "employeeId" | "customerName">;

/** Stable grouping/filter key for "who this expense was paid to" — an employee id when linked,
 *  else the free-text customer name, else a shared "unlinked" bucket. */
export function expensePayeeKey(e: PayeeFields): string {
  if (e.employeeId) return `emp:${e.employeeId}`;
  if (e.customerName) return `cust:${e.customerName}`;
  return "unlinked";
}

/** Display name for expensePayeeKey — pass the same employeeNameById map used to resolve it. */
export function expensePayeeName(e: PayeeFields, employeeNameById: Map<string, string>): string {
  if (e.employeeId) return employeeNameById.get(e.employeeId) || "Unknown employee";
  return e.customerName || "Unlinked";
}
