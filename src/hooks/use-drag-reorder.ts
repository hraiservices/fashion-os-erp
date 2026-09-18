"use client";

import { useRef, useState } from "react";

/** Generic native-HTML5-drag reorder for a flat list of rows, extracted from the dashboard
 *  grid's own drag handling (dashboard-grid.tsx) so every reorderable list in the app (dashboard
 *  customize panel, sidebar sections, menu items within a group) shares one implementation
 *  instead of three copies. Mouse/trackpad only — like the grid, this is a supplement to
 *  up/down arrow buttons, not a replacement, since native drag doesn't work on touch screens. */
export function useDragReorder<T>(items: T[], getId: (item: T) => string, onReorder: (next: T[]) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const draggingRef = useRef<string | null>(null);

  function handleDrop(targetId: string) {
    const sourceId = draggingRef.current;
    draggingRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
    if (!sourceId || sourceId === targetId) return;

    const fromIdx = items.findIndex((item) => getId(item) === sourceId);
    const toIdx = items.findIndex((item) => getId(item) === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorder(next);
  }

  function dragHandleProps(id: string) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        draggingRef.current = id;
        setDraggingId(id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
      },
      onDragEnd: () => {
        draggingRef.current = null;
        setDraggingId(null);
        setDropTargetId(null);
      },
    };
  }

  function dropTargetProps(id: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!draggingRef.current) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropTargetId(id);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        handleDrop(id);
      },
    };
  }

  return { draggingId, dropTargetId, dragHandleProps, dropTargetProps };
}
