"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Card-list alternative to a wide data table, shown only below `sm`. Pair with a `<Table>`
 * wrapped in `hidden sm:block` so desktop keeps the full grid and phones get a scannable,
 * vertically-stacked list instead of the sideways-scrolling table — the horizontal scroll on a
 * many-column table is the specific thing this replaces. Usage:
 *
 *   <div className="hidden overflow-hidden rounded-xl border sm:block"><Table>...</Table></div>
 *   <MobileRecordList>
 *     {rows.map((r) => (
 *       <MobileRecordCard key={r.id} onClick={() => router.push(`/x/${r.id}`)}>
 *         <MobileRecordHeader title={r.name} subtitle={r.mobile} value={inr(r.amount)} valueClassName="text-emerald-600" />
 *         <MobileRecordRow label="Date" value={fmtDate(r.date)} />
 *       </MobileRecordCard>
 *     ))}
 *   </MobileRecordList>
 */
export function MobileRecordList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-2 sm:hidden", className)}>{children}</div>;
}

export function MobileRecordCard({
  children,
  onClick,
  href,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  /** Renders as an anchor instead of a button when set — use for plain navigation links. */
  href?: string;
  className?: string;
}) {
  const clickable = !!onClick || !!href;
  const content = (
    <div className={cn("space-y-1.5 rounded-xl border bg-card p-3", clickable && "active:bg-muted/50", className)}>{children}</div>
  );
  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {content}
      </button>
    );
  }
  return content;
}

/** Top line of a card — a title/subtitle pair on the left, an optional bold value + chevron on the right. Covers the common "name/mobile … amount" layout most list rows share. */
export function MobileRecordHeader({
  title,
  subtitle,
  value,
  valueClassName,
  showChevron = true,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  valueClassName?: string;
  showChevron?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {(value !== undefined || showChevron) && (
        <div className="flex shrink-0 items-center gap-1">
          {value !== undefined && <span className={cn("text-sm font-semibold tabular-nums", valueClassName)}>{value}</span>}
          {showChevron && <ChevronRight className="size-3.5 text-muted-foreground/50" />}
        </div>
      )}
    </div>
  );
}

/** A label:value line below the header — for the secondary fields a table would've put in their own columns (date, status, balance, etc). */
export function MobileRecordRow({ label, value, valueClassName }: { label: React.ReactNode; value: React.ReactNode; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", valueClassName)}>{value}</span>
    </div>
  );
}
