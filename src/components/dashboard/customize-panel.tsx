"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, RotateCcw, Sparkles, Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { BUILTIN_WIDGET_BY_KEY, defaultLayout, genCustomWidgetId, type WidgetInstance } from "@/lib/dashboard-widgets";
import { CustomCardForm } from "@/components/dashboard/custom-card-form";
import type { CustomCardConfig } from "@/lib/custom-card";

export function CustomizePanel({
  open,
  onOpenChange,
  widgets,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: WidgetInstance[];
  onChange: (widgets: WidgetInstance[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const sorted = [...widgets].sort((a, b) => a.order - b.order);

  function toggleVisible(id: string) {
    onChange(widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  }

  function removeCustom(id: string) {
    onChange(widgets.filter((w) => w.id !== id));
  }

  function addCustomCard(config: CustomCardConfig) {
    const id = genCustomWidgetId();
    onChange([...widgets, { id, kind: "custom", customConfig: config, visible: true, order: widgets.length }]);
    toast.success("Custom card added");
  }

  function resetToDefault() {
    onChange(defaultLayout());
    toast.success("Dashboard reset to default");
  }

  function widgetLabel(w: WidgetInstance): string {
    if (w.kind === "custom") return w.customConfig?.title || "Custom card";
    return w.builtinKey ? BUILTIN_WIDGET_BY_KEY.get(w.builtinKey)?.title || w.builtinKey : "Widget";
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Customize dashboard</SheetTitle>
          </SheetHeader>

          <div className="space-y-1 px-4 py-2">
            <p className="mb-2 text-xs text-muted-foreground">Show or hide cards. Drag cards directly on the dashboard to reorder them.</p>
            {sorted.map((w) => (
              <div key={w.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                <button
                  type="button"
                  onClick={() => toggleVisible(w.id)}
                  className="flex size-5 shrink-0 items-center justify-center rounded-md border"
                  aria-label={w.visible ? `Hide ${widgetLabel(w)}` : `Show ${widgetLabel(w)}`}
                >
                  {w.visible && <Check className="size-3.5" />}
                </button>
                <span className="min-w-0 flex-1 truncate">{widgetLabel(w)}</span>
                {w.kind === "custom" && (
                  <>
                    <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
                    <Button variant="ghost" size="icon-sm" onClick={() => removeCustom(w.id)} aria-label="Delete custom card">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          <SheetFooter className="flex-row gap-2">
            <Button variant="outline" onClick={resetToDefault} className="flex-1">
              <RotateCcw className="size-4" /> Reset
            </Button>
            <Button onClick={() => setAddOpen(true)} className="flex-1">
              <Plus className="size-4" /> Add custom card
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <CustomCardForm open={addOpen} onOpenChange={setAddOpen} onSave={addCustomCard} />
    </>
  );
}
