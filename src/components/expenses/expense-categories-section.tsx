"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Tag, X } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

/** Deterministic color per category name so the same category always gets the same swatch, without storing a color field. */
const SWATCHES = [
  "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400",
  "bg-orange-500/10 text-orange-600 ring-orange-500/20 dark:text-orange-400",
  "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
  "bg-lime-500/10 text-lime-600 ring-lime-500/20 dark:text-lime-400",
  "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
  "bg-teal-500/10 text-teal-600 ring-teal-500/20 dark:text-teal-400",
  "bg-cyan-500/10 text-cyan-600 ring-cyan-500/20 dark:text-cyan-400",
  "bg-blue-500/10 text-blue-600 ring-blue-500/20 dark:text-blue-400",
  "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400",
  "bg-fuchsia-500/10 text-fuchsia-600 ring-fuchsia-500/20 dark:text-fuchsia-400",
  "bg-pink-500/10 text-pink-600 ring-pink-500/20 dark:text-pink-400",
];

function swatchFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return SWATCHES[hash % SWATCHES.length];
}

/** Expense categories, editable here — used by the Expenses form's category picker (with inline add-new too). */
export function ExpenseCategoriesSection() {
  const { data: categories, isLoading, save } = useAppSetting<string[]>("expenseCategories", EXPENSE_CATEGORIES as unknown as string[]);
  const [newCategory, setNewCategory] = useState("");

  const current = categories || EXPENSE_CATEGORIES;

  async function addCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (current.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("That category already exists");
      return;
    }
    try {
      await save.mutateAsync([...current, trimmed]);
      setNewCategory("");
      toast.success("Category added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add category");
    }
  }

  async function removeCategory(cat: string) {
    if (current.length <= 1) {
      toast.error("Keep at least 1 category");
      return;
    }
    try {
      await save.mutateAsync(current.filter((c) => c !== cat));
      toast.success(`"${cat}" removed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove category");
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 w-full lg:col-span-2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">All categories</CardTitle>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{current.length}</span>
          </div>
        </CardHeader>
        <CardContent>
          {current.length === 0 ? (
            <EmptyState icon={Tag} title="No categories yet" description="Add your first one from the panel on the right." />
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {current.map((cat) => (
                <div
                  key={cat}
                  className={cn(
                    "group flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ring-1 ring-inset transition-transform hover:scale-[1.02]",
                    swatchFor(cat)
                  )}
                >
                  <span className="truncate">{cat}</span>
                  <button
                    type="button"
                    onClick={() => removeCategory(cat)}
                    className="shrink-0 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-background/60 group-hover:opacity-100"
                    aria-label={`Remove ${cat}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Add a category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Category name</Label>
              <Input
                placeholder="e.g. Utilities"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
              />
            </div>
            <Button className="w-full" onClick={addCategory} disabled={save.isPending || !newCategory.trim()}>
              <Plus className="size-4" /> Add category
            </Button>
            <p className="text-xs text-muted-foreground">New categories show up immediately in the Expense form's category picker.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
