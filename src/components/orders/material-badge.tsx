"use client";

import { PackageCheck, PackageX, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { materialBadgeLabel, materialStatus, missingMaterials, type MaterialItem } from "@/lib/order-materials";

const PRE_READY = new Set(["received", "cutting", "stitching", "finishing"]);

/** Whether an order's material badge is worth showing in a list/board: tracked, and the garment isn't done yet. */
export function showMaterialBadge(order: { status: string; materials: MaterialItem[] }): boolean {
  return order.materials.length > 0 && PRE_READY.has(order.status);
}

/** Small pill: green "Material in", amber "Material 1/2", red "No material". Renders nothing for an untracked order. */
export function MaterialBadge({ materials, className }: { materials: MaterialItem[]; className?: string }) {
  const status = materialStatus(materials);
  if (status === "untracked") return null;
  const Icon = status === "complete" ? PackageCheck : status === "waiting" ? PackageX : Package;
  const missing = missingMaterials(materials);
  return (
    <span
      title={missing ? `Awaiting: ${missing}` : "All raw material received"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0 text-[10px] font-medium",
        status === "complete" && "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
        status === "partial" && "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
        status === "waiting" && "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
        className
      )}
    >
      <Icon className="size-3" />
      {materialBadgeLabel(materials)}
    </span>
  );
}
