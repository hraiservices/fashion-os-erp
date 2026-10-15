"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MaterialBadge } from "@/components/orders/material-badge";
import { MaterialsEditor } from "@/components/orders/materials-editor";
import { useSetOrderMaterials } from "@/hooks/use-order-mutations";
import { materialStatus, type MaterialItem } from "@/lib/order-materials";
import { fmtDate } from "@/lib/format";
import type { Order } from "@/lib/types";

/** Raw-material block on the order page: the badge and per-item state for everyone, with the editor + Save for those who can edit the order. */
export function MaterialsPanel({ order, canEdit }: { order: Order; canEdit: boolean }) {
  const [items, setItems] = useState<MaterialItem[]>(order.materials);
  const [note, setNote] = useState(order.materialsNote);
  const save = useSetOrderMaterials();
  const dirty = JSON.stringify(items) !== JSON.stringify(order.materials) || note !== order.materialsNote;

  async function onSave() {
    try {
      await save.mutateAsync({ id: order.id, materials: items, materialsNote: note });
      toast.success("Raw material updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  if (!canEdit && order.materials.length === 0 && !order.materialsNote) return null;

  return (
    <div className="border-t px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Raw material</p>
        {materialStatus(order.materials) !== "untracked" && <MaterialBadge materials={order.materials} />}
      </div>
      {canEdit ? (
        <div className="space-y-3">
          <MaterialsEditor items={items} note={note} onChange={setItems} onNoteChange={setNote} />
          <Button type="button" size="sm" className="h-10 w-full sm:w-auto" disabled={!dirty || save.isPending} onClick={onSave}>
            {save.isPending ? "Saving…" : "Save raw material"}
          </Button>
        </div>
      ) : (
        <ul className="space-y-1 text-sm">
          {order.materials.map((m) => (
            <li key={`${m.key}-${m.label}`} className="flex items-center justify-between gap-2">
              <span>{m.label}</span>
              <span className={m.received ? "text-emerald-600" : "text-amber-600"}>{m.received ? `Received${m.at ? ` · ${fmtDate(m.at)}` : ""}` : "Awaited"}</span>
            </li>
          ))}
          {order.materialsNote && <li className="text-muted-foreground">{order.materialsNote}</li>}
        </ul>
      )}
    </div>
  );
}
