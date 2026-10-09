import Link from "next/link";
import type { IconComponent } from "@/components/icons/duotone-icons";
import { cn } from "@/lib/utils";

/** Glanceable KPI tile. Tone conveys urgency without relying on colour alone (icon + label carry meaning too). */
export type StatTone = "default" | "warning" | "danger" | "success";

const TONE: Record<StatTone, { icon: string; value: string }> = {
  default: { icon: "bg-muted text-foreground/70", value: "" },
  warning: { icon: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", value: "text-amber-700 dark:text-amber-400" },
  danger: { icon: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", value: "text-red-700 dark:text-red-400" },
  success: { icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", value: "text-emerald-700 dark:text-emerald-400" },
};

const SPARK_STROKE: Record<StatTone, string> = {
  default: "stroke-sky-500",
  warning: "stroke-amber-500",
  danger: "stroke-red-500",
  success: "stroke-emerald-500",
};

function Sparkline({ values, tone }: { values: number[]; tone: StatTone }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const w = 100;
  const h = 24;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`);
  const last = pts[pts.length - 1].split(",");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-6 w-full overflow-visible" aria-hidden>
      <polyline points={pts.join(" ")} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className={SPARK_STROKE[tone]} />
      <circle cx={last[0]} cy={last[1]} r="2" className={cn("fill-current", SPARK_STROKE[tone].replace("stroke-", "text-"))} />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
  progress,
  delta,
  spark,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: IconComponent;
  tone?: StatTone;
  href?: string;
  /** Optional collected/settled-vs-total readout — percent (0-100) of the underlying total
   *  already collected/paid, with a caption explaining what the bar means. */
  progress?: { percent: number; caption: string };
  /** Change vs a comparison period. `pct` null = nothing to compare against. `goodWhenUp`
   *  false flips the colors for cost-like figures (expenses, purchases, refunds). */
  delta?: { pct: number | null; label: string; goodWhenUp?: boolean };
  /** Small trend line — one value per day, oldest first. Needs at least two points. */
  spark?: number[];
  /** Makes the whole card a button (e.g. to filter a list below it) instead of a link. */
  onClick?: () => void;
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
      <p className={cn("mt-2 truncate text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl", t.value)}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      {delta && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          {delta.pct === null ? (
            <span>no {delta.label} data</span>
          ) : Math.abs(delta.pct) < 0.5 ? (
            <span>— flat vs {delta.label}</span>
          ) : (
            <>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  delta.pct > 0 === (delta.goodWhenUp !== false) ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}
              >
                {delta.pct > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta.pct))}%
              </span>
              <span>vs {delta.label}</span>
            </>
          )}
        </p>
      )}
      {spark && spark.length >= 2 && <Sparkline values={spark} tone={tone} />}
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

  if (onClick && !href) {
    return (
      <button type="button" onClick={onClick} className={cn(className, "block w-full text-left hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}>
        {body}
      </button>
    );
  }

  return href ? (
    <Link href={href} className={cn(className, "block")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
