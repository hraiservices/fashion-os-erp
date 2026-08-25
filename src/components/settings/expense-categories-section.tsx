"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/business-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Shop-configurable stitching-expense categories (Lining, Thread, Buttons, ...) — the
 *  dropdown options a "+ Add Expense" row on an order picks from. Add/remove only, same
 *  reasoning as measurement fields: existing order_expenses rows keep whatever category text
 *  they were saved with even if later removed from this list. */
export function ExpenseCategoriesSection() {
  const { data: categories, isLoading, save } = useAppSetting<string[]>("stitchingExpenseCategories", DEFAULT_EXPENSE_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");

  const list = categories || [];

  async function commit(next: string[], message: string) {
    try {
      await save.mutateAsync(next);
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  function addCategory() {
    const label = newCategory.trim();
    if (!label) return;
    if (list.some((c) => c.toLowerCase() === label.toLowerCase())) {
      toast.error("That category already exists");
      return;
    }
    setNewCategory("");
    commit([...list, label], `"${label}" added`);
  }

  function removeCategory(index: number) {
    commit(
      list.filter((_, i) => i !== index),
      `"${list[index]}" removed`
    );
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm">Stitching expense categories ({list.length})</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Available choices when adding a stitching expense to an order.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => commit([...DEFAULT_EXPENSE_CATEGORIES], "Reset to default categories")} disabled={save.isPending}>
          <RotateCcw className="size-3.5" /> Reset
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="New category name (e.g. Piping)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
            aria-label="New expense category name"
          />
          <Button onClick={addCategory} disabled={save.isPending || !newCategory.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </div>

        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
            No categories — the expense picker on orders will be empty.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border">
            {list.map((c, i) => (
              <li key={`${c}-${i}`} className="flex items-center gap-2 px-3 py-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{c}</p>
                <Button variant="ghost" size="icon-sm" className="size-8" aria-label={`Remove ${c}`} disabled={save.isPending} onClick={() => removeCategory(i)}>
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
