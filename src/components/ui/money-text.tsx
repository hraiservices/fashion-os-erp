import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Shared Paid/Balance-Due money display — green for paid, red for an outstanding balance.
 * Used wherever a payment amount appears (invoices, orders, bills, customer profiles,
 * reports) so the color convention stays identical across the whole app.
 */
export function PaidAmount({ amount, className, badge = false }: { amount: number; className?: string; badge?: boolean }) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums text-emerald-600 dark:text-emerald-400",
        badge && "inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5",
        className
      )}
    >
      {inr(amount)}
    </span>
  );
}

export function BalanceDue({
  amount,
  className,
  badge = false,
  paidLabel = "Paid",
  suffix,
}: {
  amount: number;
  className?: string;
  badge?: boolean;
  /** Shown instead of ₹0 when there's nothing due. Pass "" to always show the amount. */
  paidLabel?: string;
  /** e.g. " due" appended after the amount when there's a balance. */
  suffix?: string;
}) {
  const due = amount > 0;
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        due ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
        badge && cn("inline-flex items-center rounded-md px-2 py-0.5", due ? "bg-red-500/10" : "bg-emerald-500/10"),
        className
      )}
    >
      {due ? (
        <>
          {inr(amount)}
          {suffix}
        </>
      ) : (
        paidLabel || inr(amount)
      )}
    </span>
  );
}
