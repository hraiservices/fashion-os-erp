"use client";

import { GripVertical, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WidgetSize } from "@/lib/dashboard-widgets";

const SPAN_CLASS: Record<WidgetSize, string> = {
  sm: "sm:col-span-1",
  lg: "sm:col-span-2",
  full: "sm:col-span-4",
};

/**
 * Wraps any widget for the customize grid: adds a drag handle + hide button in edit mode.
 * While editing, the widget's own links/buttons are made inert (pointer-events-none) so
 * dragging to reorder doesn't accidentally navigate — same trick as iOS's home-screen jiggle mode.
 */
export function WidgetShell({
  size,
  editing,
  dragging,
  dropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onHide,
  children,
}: {
  size: WidgetSize;
  editing: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onHide?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative col-span-1",
        SPAN_CLASS[size],
        editing && "rounded-xl outline-dashed outline-2 outline-transparent transition-all hover:outline-primary/40",
        dragging && "opacity-40",
        dropTarget && "outline-primary/60"
      )}
      draggable={editing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {editing && (
        <>
          <button
            type="button"
            onClick={onHide}
            className="absolute -top-2 -right-2 z-10 flex size-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-destructive/10 hover:text-destructive"
            aria-label="Hide widget"
          >
            <EyeOff className="size-3.5" />
          </button>
          <div className="absolute -top-2 -left-2 z-10 flex size-6 cursor-grab items-center justify-center rounded-full border bg-background shadow-sm active:cursor-grabbing">
            <GripVertical className="size-3.5" />
          </div>
        </>
      )}
      <div className={editing ? "pointer-events-none select-none" : ""}>{children}</div>
    </div>
  );
}
