import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Glanceable KPI tile. Tone conveys urgency without relying on colour alone (icon + label carry meaning too). */
export type StatTone = "default" | "warning" | "danger" | "success";

const TONE: Record<StatTone, { icon: string; value: string }> = {
  default: { icon: "bg-muted text-foreground/70", value: "" },
  warning: { icon: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", value: "text-amber-700 dark:text-amber-400" },
  danger: { icon: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", value: "text-red-700 dark:text-red-400" },
  success: { icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", value: "text-emerald-700 dark:text-emerald-400" },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
  progress,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: StatTone;
  href?: string;
  /** Optional collected/settled-vs-total readout — percent (0-100) of the underlying total
   *  already collected/paid, with a caption explaining what the bar means. */
  progress?: { percent: number; caption: string };
}) {
  const t = TONE[tone];
  const pct = progress ? Math.min(100, Math.max(0, progress.percent)) : 0;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", t.icon)}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl", t.value)}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      {progress && (
        <div className="mt-4">
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="flex h-full">
              <div className="h-full rounded-l-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              <div className="h-full flex-1 rounded-r-full bg-red-500" />
            </div>
          </div>
          <p className="flex items-baseline justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block size-2.5 rounded-full bg-emerald-500" />
              {progress.caption}
            </span>
            <span className="font-medium tabular-nums text-foreground">{Math.round(pct)}%</span>
          </p>
        </div>
      )}
    </>
  );

  const className = cn(
    "rounded-xl border bg-card p-4 transition-colors",
    href && "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
  );

  return href ? (
    <Link href={href} className={cn(className, "block")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
