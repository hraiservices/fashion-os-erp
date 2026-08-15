"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { normalizeExpenseCategories, type ExpenseCategoryItem } from "@/lib/types";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ADD_NEW = "__add_new__";

/** Category dropdown with subcategory grouping and inline add-new for top-level categories. */
export function CategoryPicker({ value, onChange }: { value: string; onChange: (category: string) => void }) {
  const { data: raw, isLoading, save } = useAppSetting<ExpenseCategoryItem[]>("expenseCategories", []);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const current: ExpenseCategoryItem[] = normalizeExpenseCategories(raw);

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      if (!current.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
        await save.mutateAsync([...current, { name: trimmed, subcategories: [] }] as unknown as ExpenseCategoryItem[]);
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
        <Input
          autoFocus
          placeholder="New category name"
          className="h-10"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
            if (e.key === "Escape") { setAdding(false); setNewName(""); }
          }}
        />
        <Button type="button" size="sm" onClick={handleAdd} disabled={save.isPending}>Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
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
      <SelectTrigger className="h-10 w-full">
        <SelectValue placeholder="Select category" />
      </SelectTrigger>
      <SelectContent>
        {current.map((cat) =>
          cat.subcategories.length > 0 ? (
            /* Category with subcategories — show as a group; parent is also selectable */
            <SelectGroup key={cat.name}>
              <SelectLabel className="py-1.5 text-xs font-semibold">{cat.name}</SelectLabel>
              {/* Parent itself as first option inside the group */}
              <SelectItem value={cat.name} className="pl-6 text-xs">
                {cat.name} (general)
              </SelectItem>
              {cat.subcategories.map((sub) => (
                <SelectItem key={sub} value={`${cat.name} > ${sub}`} className="pl-6 text-xs">
                  {sub}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : (
            /* Simple category — single item, no group */
            <SelectItem key={cat.name} value={cat.name}>
              {cat.name}
            </SelectItem>
          )
        )}
        <SelectItem value={ADD_NEW}>
          <Plus className="size-3.5" /> Add new category…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
