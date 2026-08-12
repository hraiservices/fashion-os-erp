"use client";

import { useRef, useState } from "react";
import { BUILTIN_WIDGET_BY_KEY, type WidgetInstance, type WidgetSize } from "@/lib/dashboard-widgets";
import { WIDGET_COMPONENTS } from "@/components/dashboard/widget-registry";
import { WidgetShell } from "@/components/dashboard/widget-shell";
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

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);

  // Live resize preview — not saved until mouseup
  const [resizeLive, setResizeLive] = useState<{ id: string; colSpan: 1 | 2 | 3 | 4; heightPx: number } | null>(null);

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

  function handleResizeProgress(id: string, colSpan: 1 | 2 | 3 | 4, heightPx: number) {
    setResizeLive({ id, colSpan, heightPx });
  }

  function handleResizeEnd(id: string, colSpan: 1 | 2 | 3 | 4, heightPx: number) {
    setResizeLive(null);
    onChange(widgets.map((w) => (w.id !== id ? w : { ...w, colSpan, heightPx })));
  }

  function renderContent(w: WidgetInstance) {
    if (w.kind === "custom" && w.customConfig) return <CustomCardWidget config={w.customConfig} />;
    if (w.kind === "builtin" && w.builtinKey) {
      const Component = WIDGET_COMPONENTS[w.builtinKey];
      return Component ? <Component /> : null;
    }
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4" data-dashboard-grid>
      {visible.map((w) => {
        const isResizing = resizeLive?.id === w.id;
        const colSpan = isResizing ? resizeLive.colSpan : getEffectiveCols(w);
        const heightPx = isResizing ? resizeLive.heightPx : w.heightPx;
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
            onResizeProgress={(cols, h) => handleResizeProgress(w.id, cols, h)}
            onResizeEnd={(cols, h) => handleResizeEnd(w.id, cols, h)}
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
  );
}
