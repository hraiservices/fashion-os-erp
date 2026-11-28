"use client";

import { BarChart3 } from "lucide-react";
import { useLightweightMode } from "@/hooks/use-lightweight-mode";
import { cn } from "@/lib/utils";

/**
 * Wraps a chart (recharts or otherwise) and swaps it for a plain placeholder in Light Weight
 * mode instead of rendering it — recharts' own SVG layout/animation work is real rendering
 * weight, not just visual clutter. Drop this in place of the chart itself (inside whatever
 * fixed-height wrapper div the widget already has); the placeholder fills the same space so
 * nothing jumps.
 */
export function LiteChartGate({ children, className }: { children: React.ReactNode; className?: string }) {
  const [lite] = useLightweightMode();
  if (!lite) return <>{children}</>;
  return (
    <div className={cn("flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground", className)}>
      <BarChart3 className="size-5 opacity-50" />
      <span className="text-[11px]">Chart hidden — Light Weight mode</span>
    </div>
  );
}
