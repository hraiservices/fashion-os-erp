"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomCardValue } from "@/hooks/use-custom-card-value";
import {
  DATA_SOURCES,
  AGGREGATION_LABELS,
  FILTER_OPERATOR_LABELS,
  blankCustomCard,
  type CustomCardConfig,
  type CustomDataSourceKey,
  type Aggregation,
  type FilterOperator,
  type FilterRule,
} from "@/lib/custom-card";
import { inr } from "@/lib/format";

const dataSourceLabel = (v: unknown) => DATA_SOURCES[v as CustomDataSourceKey]?.label ?? "";
const aggregationLabel = (v: unknown) => AGGREGATION_LABELS[v as Aggregation] ?? "";
const operatorLabel = (v: unknown) => FILTER_OPERATOR_LABELS[v as FilterOperator] ?? "";
const formatLabel = (v: unknown) => (v === "currency" ? "Currency (₹)" : "Plain number");

function Preview({ config }: { config: CustomCardConfig }) {
  const { value, isLoading } = useCustomCardValue(config);
  if (isLoading) return <p className="text-xs text-muted-foreground">Calculating…</p>;
  const display = config.format === "currency" ? inr(Math.round(value * 100) / 100) : Math.round(value * 100) / 100;
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-center">
      <p className="text-2xl font-semibold tabular-nums">{display}</p>
      <p className="text-xs text-muted-foreground">{config.title || "Untitled card"}</p>
    </div>
  );
}

export function CustomCardForm({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: CustomCardConfig;
  onSave: (config: CustomCardConfig) => void;
}) {
  const [config, setConfig] = useState<CustomCardConfig>(initial || blankCustomCard());

  const source = DATA_SOURCES[config.dataSource];
  const numericFields = useMemo(() => source.fields.filter((f) => f.type === "number"), [source]);

  function handleClose() {
    setConfig(initial || blankCustomCard());
    onOpenChange(false);
  }

  function changeDataSource(key: CustomDataSourceKey) {
    setConfig((c) => ({ ...c, dataSource: key, field: undefined, filters: [] }));
  }

  function addFilter() {
    if (config.filters.length >= 3) return;
    const f = source.fields[0];
    setConfig((c) => ({ ...c, filters: [...c.filters, { field: f.key, operator: "eq", value: "" }] }));
  }

  function updateFilter(i: number, patch: Partial<FilterRule>) {
    setConfig((c) => ({ ...c, filters: c.filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) }));
  }

  function removeFilter(i: number) {
    setConfig((c) => ({ ...c, filters: c.filters.filter((_, idx) => idx !== i) }));
  }

  function handleSave() {
    if (!config.title.trim()) return toast.error("Give the card a title");
    if (config.aggregation !== "count" && !config.field) return toast.error("Pick a field to aggregate");
    onSave({ ...config, title: config.title.trim() });
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg overflow-hidden">
        <DialogHeader className="border-b px-5 py-4 shrink-0">
          <DialogTitle>{initial ? "Edit custom card" : "Create custom card"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Title *</Label>
            <Input placeholder="e.g. Big orders this month" value={config.title} onChange={(e) => setConfig({ ...config, title: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Data source</Label>
              <Select value={config.dataSource} onValueChange={(v) => v && changeDataSource(v as CustomDataSourceKey)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{dataSourceLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.values(DATA_SOURCES).map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Aggregation</Label>
              <Select value={config.aggregation} onValueChange={(v) => v && setConfig({ ...config, aggregation: v as Aggregation })}>
                <SelectTrigger className="w-full">
                  <SelectValue>{aggregationLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(AGGREGATION_LABELS) as Aggregation[]).map((a) => (
                    <SelectItem key={a} value={a}>
                      {AGGREGATION_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {config.aggregation !== "count" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Field</Label>
                <Select value={config.field || ""} onValueChange={(v) => v && setConfig({ ...config, field: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select field…" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericFields.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Display as</Label>
                <Select value={config.format} onValueChange={(v) => v && setConfig({ ...config, format: v as "number" | "currency" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{formatLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">Plain number</SelectItem>
                    <SelectItem value="currency">Currency (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Filters (optional, up to 3)</Label>
              {config.filters.length < 3 && (
                <Button type="button" variant="outline" size="sm" onClick={addFilter}>
                  <Plus className="size-3.5" /> Add filter
                </Button>
              )}
            </div>
            {config.filters.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Select value={f.field} onValueChange={(v) => v && updateFilter(i, { field: v })}>
                  <SelectTrigger className="flex-1">
                    <SelectValue>{(v: unknown) => source.fields.find((sf) => sf.key === v)?.label ?? ""}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {source.fields.map((sf) => (
                      <SelectItem key={sf.key} value={sf.key}>
                        {sf.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={f.operator} onValueChange={(v) => v && updateFilter(i, { operator: v as FilterOperator })}>
                  <SelectTrigger className="w-32">
                    <SelectValue>{operatorLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FILTER_OPERATOR_LABELS) as FilterOperator[]).map((op) => (
                      <SelectItem key={op} value={op}>
                        {FILTER_OPERATOR_LABELS[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input className="w-24" placeholder="Value" value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })} />
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeFilter(i)} aria-label="Remove filter">
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Preview</Label>
            <Preview config={config} />
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 border-t px-5 py-3 shrink-0">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{initial ? "Save changes" : "Add card"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
