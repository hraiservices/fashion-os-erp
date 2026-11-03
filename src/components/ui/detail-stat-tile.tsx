import { cn } from "@/lib/utils";

/**
 * Zoho-style big-number stat tile for a detail page's summary row (customer/vendor/employee
 * profile pages) — a bordered card with a large tabular-nums value and a muted uppercase label
 * underneath, laid out in a flex-wrap row so each tile gets real breathing room on wide screens
 * instead of being crammed into a dense fixed-column grid. Replaces the older cramped
 * `grid-cols-2 gap-px` tile grid on the Customer profile page; the plan is to reuse this same
 * component on Vendor/Employee detail pages next for a consistent look across all of them.
 */
export function DetailStatRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

export function DetailStatTile({
  value,
  label,
  tone = "default",
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  tone?: "default" | "due" | "good";
}) {
  return (
    <div className="min-w-[9rem] flex-1 rounded-xl border bg-card px-4 py-3.5 sm:min-w-[10rem]">
      <p
        className={cn(
          "truncate text-2xl font-bold tabular-nums",
          tone === "due" && "text-red-600 dark:text-red-400",
          tone === "good" && "text-emerald-600 dark:text-emerald-400"
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
