"use client";

import { Button } from "@/components/ui/button";

/**
 * The "Show all / Show less" row under a list that only previews its newest few entries.
 * Renders nothing when the list already fits the preview, so a short list never grows a
 * pointless button. The caller owns the expanded state and slices its own rows — this is just
 * the control, so every section on a page words and places it identically.
 */
export function ShowAllRow({
  total,
  limit,
  expanded,
  onToggle,
  moreBeyondTotal,
}: {
  total: number;
  limit: number;
  expanded: boolean;
  onToggle: () => void;
  /** The list is paged and `total` is only what has loaded so far — label it "20+" rather than "20". */
  moreBeyondTotal?: boolean;
}) {
  if (total <= limit) return null;
  return (
    <div className="border-t p-1.5 text-center">
      <Button type="button" variant="ghost" size="sm" onClick={onToggle}>
        {expanded ? "Show less" : `Show all ${total}${moreBeyondTotal ? "+" : ""}`}
      </Button>
    </div>
  );
}
