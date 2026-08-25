import Link from "next/link";

export interface RefChipItem {
  key: string;
  label: string;
  href: string;
}

/** Small clickable reference pills (order numbers, invoice numbers) — each jumps straight to
 *  its own detail page. Caps how many render inline so a long-standing customer with dozens of
 *  orders doesn't blow out the row; the rest are reachable from the customer profile itself,
 *  which the overflow chip links to. */
export function RefChips({ items, moreHref, max = 3 }: { items: RefChipItem[]; moreHref: string; max?: number }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = items.slice(0, max);
  const overflow = items.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {shown.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className="inline-flex items-center rounded-full border bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted"
        >
          {item.label}
        </Link>
      ))}
      {overflow > 0 && (
        <Link href={moreHref} className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:underline">
          +{overflow} more
        </Link>
      )}
    </div>
  );
}
