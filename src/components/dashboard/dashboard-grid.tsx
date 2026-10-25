"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BUILTIN_WIDGET_BY_KEY, type WidgetInstance, type WidgetSize } from "@/lib/dashboard-widgets";
import { WIDGET_COMPONENTS } from "@/components/dashboard/widget-registry";
import { WidgetShell } from "@/components/dashboard/widget-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { CustomCardWidget } from "@/components/dashboard/custom-card-widget";

const SIZE_TO_COLS: Record<WidgetSize, 1 | 2 | 3 | 4> = { sm: 1, lg: 2, full: 4 };

function getDefaultCols(w: WidgetInstance): 1 | 2 | 3 | 4 {
  if (w.kind === "custom") return 1;
  const size = BUILTIN_WIDGET_BY_KEY.get(w.builtinKey || "")?.size ?? "sm";
  return SIZE_TO_COLS[size];
}

function getEffectiveCols(w: WidgetInstance): 1 | 2 | 3 | 4 {
  return w.colSpan ?? getDefaultCols(w);
}

// Mobile, not editing: show only the first N widgets with a "Show more" toggle below the
// carousel — the full grid's worth of widgets stacked one per row was the single biggest
// contributor to how far you had to scroll before reaching anything past the header.
const MOBILE_COLLAPSED_COUNT = 4;

export function DashboardGrid({
  widgets,
  editing,
  onChange,
}: {
  widgets: WidgetInstance[];
  editing: boolean;
  onChange: (widgets: WidgetInstance[]) => void;
}) {
  const visible = widgets.filter((w) => w.visible).sort((a, b) => a.order - b.order);
  const [mobileShowAll, setMobileShowAll] = useState(false);
  const mobileVisible = mobileShowAll ? visible : visible.slice(0, MOBILE_COLLAPSED_COUNT);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);

  // Live resize preview — not saved until mouseup
  const [resizeLive, setResizeLive] = useState<{ id: string; colSpan: 1 | 2 | 3 | 4 } | null>(null);
  const [heightResizeLive, setHeightResizeLive] = useState<{ id: string; heightPx: number } | null>(null);

  function handleDrop(targetId: string) {
    const sourceId = draggingRef.current;
    draggingRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
    if (!sourceId || sourceId === targetId) return;

    const ordered = [...widgets].sort((a, b) => a.order - b.order);
    const fromIdx = ordered.findIndex((w) => w.id === sourceId);
    const toIdx = ordered.findIndex((w) => w.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    onChange(ordered.map((w, i) => ({ ...w, order: i })));
  }

  function hideWidget(id: string) {
    onChange(widgets.map((w) => (w.id === id ? { ...w, visible: false } : w)));
  }

  function handleResizeProgress(id: string, colSpan: 1 | 2 | 3 | 4) {
    setResizeLive({ id, colSpan });
  }

  function handleResizeEnd(id: string, colSpan: 1 | 2 | 3 | 4) {
    setResizeLive(null);
    onChange(widgets.map((w) => (w.id !== id ? w : { ...w, colSpan })));
  }

  function resetWidgetSize(id: string) {
    onChange(widgets.map((w) => (w.id !== id ? w : { ...w, colSpan: undefined, heightPx: undefined })));
  }

  function handleResizeHeightProgress(id: string, heightPx: number) {
    setHeightResizeLive({ id, heightPx });
  }

  function handleResizeHeightEnd(id: string, heightPx: number) {
    setHeightResizeLive(null);
    onChange(widgets.map((w) => (w.id !== id ? w : { ...w, heightPx })));
  }

  function renderContent(w: WidgetInstance) {
    // Every card is wrapped on its own: one widget throwing (an API answering in an unexpected
    // shape, a number that isn't there) used to take the whole Dashboard down to the route-level
    // "Something went wrong" page. Now the broken card says so and the rest still works.
    const label = w.kind === "builtin" && w.builtinKey ? BUILTIN_WIDGET_BY_KEY.get(w.builtinKey)?.title : w.customConfig?.title;
    const inner = () => {
      if (w.kind === "custom" && w.customConfig) return <CustomCardWidget config={w.customConfig} />;
      if (w.kind === "builtin" && w.builtinKey) {
        const Component = WIDGET_COMPONENTS[w.builtinKey];
        return Component ? <Component /> : null;
      }
      return null;
    };
    const content = inner();
    return content ? <ErrorBoundary label={label || "This card"}>{content}</ErrorBoundary> : null;
  }

  return (
    // No `items-start` — cards in the same row now stretch to match the row's tallest card
    // (CSS Grid's default `align-items: stretch`), instead of each sizing purely to its own
    // content and leaving a ragged, gap-filled row. A widget whose own content doesn't grow to
    // fill that height (a fixed-size chart/stat card) just gets some breathing room at the
    // bottom, which reads as normal card padding rather than the "why is this row so uneven"
    // look a short list widget next to a tall one produced before. List-style widgets (see
    // countdown-widgets.tsx, tailor-load-widget.tsx, etc.) are built to actually absorb that
    // extra height (flex-1 + overflow-y-auto on the list), so they visibly fill the row instead
    // of just padding out under a fixed-height clipped list.
    <>
      {/* The real grid — always used while editing (reordering/resizing only make sense in the
       *  grid's own layout, at any breakpoint), and on sm+ at any time. Hidden on mobile outside
       *  editing, where the horizontal carousel below takes over instead. */}
      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-4", !editing && "hidden sm:grid")} data-dashboard-grid>
        {visible.map((w) => {
          const isResizing = resizeLive?.id === w.id;
          const colSpan = isResizing ? resizeLive.colSpan : getEffectiveCols(w);
          const isHeightResizing = heightResizeLive?.id === w.id;
          const heightPx = isHeightResizing ? heightResizeLive.heightPx : w.heightPx;
          const href = w.kind === "builtin" ? BUILTIN_WIDGET_BY_KEY.get(w.builtinKey || "")?.href : undefined;

          return (
            <WidgetShell
              key={w.id}
              colSpan={colSpan}
              heightPx={heightPx}
              href={href}
              editing={editing}
              dragging={draggingId === w.id}
              dropTarget={dropTargetId === w.id}
              onHide={() => hideWidget(w.id)}
              onResizeProgress={(cols) => handleResizeProgress(w.id, cols)}
              onResizeEnd={(cols) => handleResizeEnd(w.id, cols)}
              onResizeHeightProgress={(px) => handleResizeHeightProgress(w.id, px)}
              onResizeHeightEnd={(px) => handleResizeHeightEnd(w.id, px)}
              onResetSize={() => resetWidgetSize(w.id)}
              onDragStart={(e) => {
                draggingRef.current = w.id;
                setDraggingId(w.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", w.id);
              }}
              onDragOver={(e) => {
                if (!draggingRef.current) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropTargetId(w.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(w.id);
              }}
              onDragEnd={() => {
                draggingRef.current = null;
                setDraggingId(null);
                setDropTargetId(null);
              }}
            >
              {renderContent(w)}
            </WidgetShell>
          );
        })}
      </div>

      {/* Mobile, not editing: horizontally-scrollable carousel instead of a tall stacked column
       *  — each widget keeps its own card styling (set inside the widget components themselves,
       *  not by WidgetShell), just laid out side by side with scroll-snap instead of one per
       *  row. Reordering/resizing don't apply here (no grip, no handles — WidgetShell's own
       *  editing-only chrome stays off since editing is always false in this branch). */}
      {!editing && (
        <div className="sm:hidden">
          <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-1" style={{ scrollSnapType: "x mandatory" }}>
            {mobileVisible.map((w) => {
              const href = w.kind === "builtin" ? BUILTIN_WIDGET_BY_KEY.get(w.builtinKey || "")?.href : undefined;
              return (
                <div key={w.id} className="w-[85vw] max-w-sm shrink-0" style={{ scrollSnapAlign: "start" }}>
                  <WidgetShell colSpan={1} href={href} editing={false}>
                    {renderContent(w)}
                  </WidgetShell>
                </div>
              );
            })}
          </div>
          {visible.length > MOBILE_COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setMobileShowAll((v) => !v)}
              className="mt-2 min-h-11 w-full rounded-lg border bg-card py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {mobileShowAll ? "Show less" : `Show ${visible.length - MOBILE_COLLAPSED_COUNT} more`}
            </button>
          )}
        </div>
      )}
    </>
  );
}
