import { STAGE_META, dueBadge, type Stage } from "@/lib/business-rules";
import { STAGE_STYLE, dueStyleFor } from "@/lib/design/stages";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";

/** Stage pill with a real icon (replaces the emoji + inline-hex badges). */
export function StageBadge({ stage, className, size = "default" }: { stage: Stage; className?: string; size?: "default" | "sm" }) {
  const meta = STAGE_META[stage];
  const style = STAGE_STYLE[stage];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        style.badge,
        className
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} />
      {meta.label}
    </span>
  );
}

/** "Move to CUTTING" label for a stage-advance button — the destination stage name is bold
 *  caps so it reads at a glance on a crowded card/row, "Move to" stays normal weight/case as
 *  just the lead-in word. Shared so every stage-advance button (board card, order list row,
 *  order detail page, manufacturing work order) renders it identically. */
export function MoveToStageLabel({ label }: { label: string }) {
  return (
    <>
      Move to <span className="font-bold uppercase">{label}</span>
    </>
  );
}

/** Due-date urgency pill. Returns null for delivered/paid orders, same as dueBadge(). */
export function DueBadge({ order, className }: { order: Pick<Order, "status" | "deliveryDate">; className?: string }) {
  const badge = dueBadge(order as Order);
  if (!badge) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium", dueStyleFor(badge.text, badge.urgent), className)}>
      {badge.text}
    </span>
  );
}
