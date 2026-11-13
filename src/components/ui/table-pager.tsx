"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Zoho-style pager for a table or card list: "Total Count: 37" on the left and a small bordered
 * "‹  11 - 20  ›" control on the right. The caller owns the page number (0-based) and slices its
 * own rows — this is only the control, so every list that pages looks and behaves the same.
 *
 * The arrows only appear when there is more than one page; "Total Count" always shows, so a short
 * list still tells you how many rows it holds. Arrows are 44px tall on a phone, 32px from sm up,
 * like the rest of the app's controls.
 */
export function TablePager({
  total,
  page,
  pageSize,
  onPage,
  className,
}: {
  total: number;
  /** 0-based. */
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const arrow = "flex size-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 sm:size-8";

  return (
    <div className={cn("flex items-center justify-between gap-3 border-t px-4 py-2.5 text-sm", className)}>
      <p className="text-muted-foreground">
        Total Count: <span className="font-medium text-foreground tabular-nums">{total}</span>
      </p>
      {pages > 1 && (
        <div className="flex items-center overflow-hidden rounded-lg border">
          <button type="button" className={arrow} onClick={() => onPage(page - 1)} disabled={page <= 0} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-20 border-x px-3 text-center text-sm font-medium tabular-nums" aria-live="polite">
            {from} - {to}
          </span>
          <button type="button" className={arrow} onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
