"use client";

import { useRef, useState } from "react";
import { BUILTIN_WIDGET_BY_KEY, type WidgetInstance } from "@/lib/dashboard-widgets";
import { WIDGET_COMPONENTS } from "@/components/dashboard/widget-registry";
import { WidgetShell } from "@/components/dashboard/widget-shell";
import { CustomCardWidget } from "@/components/dashboard/custom-card-widget";

/**
 * Renders the visible widgets in order and — while editing — supports HTML5 drag-and-drop
 * reordering, same pattern as the Kanban board's drag handlers.
 */
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

  function renderContent(w: WidgetInstance) {
    if (w.kind === "custom" && w.customConfig) return <CustomCardWidget config={w.customConfig} />;
    if (w.kind === "builtin" && w.builtinKey) {
      const Component = WIDGET_COMPONENTS[w.builtinKey];
      return Component ? <Component /> : null;
    }
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      {visible.map((w) => {
        const size = w.kind === "custom" ? "sm" : BUILTIN_WIDGET_BY_KEY.get(w.builtinKey || "")?.size || "sm";
        return (
          <WidgetShell
            key={w.id}
            size={size}
            editing={editing}
            dragging={draggingId === w.id}
            dropTarget={dropTargetId === w.id}
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
            onHide={() => hideWidget(w.id)}
          >
            {renderContent(w)}
          </WidgetShell>
        );
      })}
    </div>
  );
}
