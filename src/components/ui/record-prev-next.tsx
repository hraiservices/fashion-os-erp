"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Flip to the adjacent record in the same list this page's sidebar shows, without hunting for it
 * there — same ordering the sidebar uses (whatever `items` was built from). Desktop/tablet only
 * (hidden below sm), matching the sidebar it complements; on a phone there's no sidebar to "flip
 * within" so this would be a confusing no-op button most of the time.
 */
export function RecordPrevNext({ items, activeId }: { items: { id: string; href: string }[]; activeId: string }) {
  const index = items.findIndex((i) => i.id === activeId);
  if (index < 0) return null;
  const prev = index > 0 ? items[index - 1] : null;
  const next = index < items.length - 1 ? items[index + 1] : null;

  const btn = (item: { href: string } | null, icon: React.ReactNode, label: string) =>
    item ? (
      <Link href={item.href} aria-label={label} title={label} className="flex size-8 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        {icon}
      </Link>
    ) : (
      <span aria-hidden className="flex size-8 items-center justify-center rounded-lg border bg-card text-muted-foreground/30">
        {icon}
      </span>
    );

  return (
    <div className={cn("hidden items-center gap-1 sm:flex")}>
      {btn(prev, <ChevronLeft className="size-4" />, "Previous record")}
      <span className="px-1 text-xs tabular-nums text-muted-foreground">
        {index + 1} / {items.length}
      </span>
      {btn(next, <ChevronRight className="size-4" />, "Next record")}
    </div>
  );
}
