"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ADD_NEW = "__add_new__";

/** Category dropdown that lets a user add a brand-new expense category inline, live. */
export function CategoryPicker({ value, onChange }: { value: string; onChange: (category: string) => void }) {
  const { data: categories, isLoading, save } = useAppSetting<string[]>("expenseCategories", EXPENSE_CATEGORIES as unknown as string[]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const current = categories || EXPENSE_CATEGORIES;

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      if (!current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
        await save.mutateAsync([...current, trimmed]);
      }
      onChange(trimmed);
      setNewName("");
      setAdding(false);
      toast.success(`Category "${trimmed}" added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add category");
    }
  }

  if (adding) {
    return (
      <div className="flex gap-1.5">
        <Input autoFocus placeholder="New category name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <Button type="button" size="sm" onClick={handleAdd} disabled={save.isPending}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === ADD_NEW) setAdding(true);
        else if (v) onChange(v);
      }}
      disabled={isLoading}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select category" />
      </SelectTrigger>
      <SelectContent>
        {current.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
        <SelectItem value={ADD_NEW}>
          <Plus className="size-3.5" /> Add new category…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
