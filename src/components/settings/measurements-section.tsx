"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { useMeasureFields } from "@/hooks/use-measure-fields";
import { DEF_MF_LABELS, toMKey, measureLabel } from "@/lib/measurements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Measurement field editor. The old app kept this list in sw_mfields_v5 and used it to
 * drive the order form's measurement inputs; order rows store values keyed by toMKey(label),
 * so renaming a field orphans previously-stored values — hence add/remove/reorder only.
 */
export function MeasurementsSection() {
  const { data: fields, isLoading, save } = useMeasureFields();
  const [newField, setNewField] = useState("");

  const list = fields || [];

  async function commit(next: string[], message: string) {
    try {
      await save.mutateAsync(next);
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  function addField() {
    const label = newField.trim();
    if (!label) return;
    if (list.some((f) => toMKey(f) === toMKey(label))) {
      toast.error("That field already exists");
      return;
    }
    setNewField("");
    commit([...list, label], `"${label}" added`);
  }

  function removeField(index: number) {
    commit(
      list.filter((_, i) => i !== index),
      `"${list[index]}" removed`
    );
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next, "Order updated");
  }

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm">Measurement fields ({list.length})</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">These appear on every order form, in this order.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => commit([...DEF_MF_LABELS], "Reset to default fields")} disabled={save.isPending}>
          <RotateCcw className="size-3.5" /> Reset
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="New field name (e.g. Shoulder)"
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addField()}
            aria-label="New measurement field name"
          />
          <Button onClick={addField} disabled={save.isPending || !newField.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </div>

        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
            No measurement fields — orders won&apos;t ask for measurements.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border">
            {list.map((f, i) => (
              <li key={`${toMKey(f)}-${i}`} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {measureLabel(f, "hi") !== f ? `${measureLabel(f, "hi")} · ` : ""}
                    <code>{toMKey(f)}</code>
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" className="size-8" aria-label={`Move ${f} up`} disabled={i === 0 || save.isPending} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  aria-label={`Move ${f} down`}
                  disabled={i === list.length - 1 || save.isPending}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" className="size-8" aria-label={`Remove ${f}`} disabled={save.isPending} onClick={() => removeField(i)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
