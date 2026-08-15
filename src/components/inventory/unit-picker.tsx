"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useUnits, useAddUnit } from "@/hooks/use-units";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ADD_NEW = "__add_new__";

/** Unit dropdown that lets a user add a brand-new unit inline, live — no separate settings screen. */
export function UnitPicker({ value, onChange }: { value: string; onChange: (unitId: string) => void }) {
  const { data: units, isLoading } = useUnits();
  const addUnit = useAddUnit();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  async function handleAdd() {
    if (!newName.trim()) return;
    try {
      const unit = await addUnit.mutateAsync(newName);
      onChange(unit.id);
      setNewName("");
      setAdding(false);
      toast.success(`Unit "${unit.name}" added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add unit");
    }
  }

  if (adding) {
    return (
      <div className="flex gap-1.5">
        <Input autoFocus placeholder="New unit name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <Button type="button" size="sm" onClick={handleAdd} disabled={addUnit.isPending}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  const unitLabel = (v: unknown) => (units || []).find((u) => u.id === v)?.name ?? "";

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === ADD_NEW) setAdding(true);
        else if (v) onChange(v);
      }}
      disabled={isLoading}
    >
      <SelectTrigger className="h-10 w-full">
        <SelectValue placeholder="Select unit…">{unitLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(units || []).map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name}
          </SelectItem>
        ))}
        <SelectItem value={ADD_NEW}>
          <Plus className="size-3.5" /> Add new unit…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
