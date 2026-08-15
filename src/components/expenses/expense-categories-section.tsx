"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Tag, X, ChevronDown, ChevronRight } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { EXPENSE_CATEGORIES, normalizeExpenseCategories, type ExpenseCategoryItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

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

function CategoryCard({
  cat,
  onRemoveCategory,
  onAddSubcategory,
  onRemoveSubcategory,
  saving,
}: {
  cat: ExpenseCategoryItem;
  onRemoveCategory: () => void;
  onAddSubcategory: (sub: string) => void;
  onRemoveSubcategory: (sub: string) => void;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addingSubcat, setAddingSubcat] = useState(false);
  const [subName, setSubName] = useState("");

  function handleAddSubcat() {
    const trimmed = subName.trim();
    if (!trimmed) return;
    onAddSubcategory(trimmed);
    setSubName("");
    setAddingSubcat(false);
  }

  return (
    <div className={cn("rounded-xl ring-1 ring-inset overflow-hidden", swatchFor(cat.name))}>
      {/* Main category row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-1.5 text-left text-sm font-medium"
        >
          {cat.subcategories.length > 0 ? (
            expanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />
          ) : (
            <span className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{cat.name}</span>
          {cat.subcategories.length > 0 && (
            <span className="ml-1 rounded-full bg-background/50 px-1.5 text-[10px] tabular-nums">
              {cat.subcategories.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setAddingSubcat(true); setExpanded(true); }}
          title="Add subcategory"
          className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 hover:bg-background/50"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemoveCategory}
          title={`Remove ${cat.name}`}
          className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-background/50"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Subcategories */}
      {(expanded || addingSubcat) && (
        <div className="border-t border-current/10 bg-background/40 px-3 pb-2.5 pt-2 space-y-1.5">
          {cat.subcategories.map((sub) => (
            <div key={sub} className="flex items-center gap-1.5 text-xs">
              <span className="w-2 shrink-0 text-current/40">└</span>
              <span className="flex-1 truncate font-medium">{sub}</span>
              <button
                type="button"
                onClick={() => onRemoveSubcategory(sub)}
                className="shrink-0 rounded p-0.5 opacity-50 hover:opacity-100 hover:bg-background/50"
                aria-label={`Remove ${sub}`}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {cat.subcategories.length === 0 && !addingSubcat && (
            <p className="text-[11px] text-current/50 pl-3.5">No subcategories yet</p>
          )}
          {addingSubcat && (
            <div className="flex items-center gap-1.5 pl-3.5">
              <Input
                autoFocus
                placeholder="Subcategory name"
                className="h-7 text-xs"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSubcat();
                  if (e.key === "Escape") { setAddingSubcat(false); setSubName(""); }
                }}
              />
              <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={handleAddSubcat} disabled={saving || !subName.trim()}>
                Add
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setAddingSubcat(false); setSubName(""); }}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ExpenseCategoriesSection() {
  const { data: raw, isLoading, save } = useAppSetting<ExpenseCategoryItem[]>("expenseCategories", []);
  const [newCategory, setNewCategory] = useState("");

  const current: ExpenseCategoryItem[] = normalizeExpenseCategories(raw);

  async function persist(next: ExpenseCategoryItem[]) {
    await save.mutateAsync(next as unknown as ExpenseCategoryItem[]);
  }

  async function addCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (current.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("That category already exists");
      return;
    }
    try {
      await persist([...current, { name: trimmed, subcategories: [] }]);
      setNewCategory("");
      toast.success("Category added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add category");
    }
  }

  async function removeCategory(name: string) {
    if (current.length <= 1) { toast.error("Keep at least 1 category"); return; }
    try {
      await persist(current.filter((c) => c.name !== name));
      toast.success(`"${name}" removed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  async function addSubcategory(catName: string, sub: string) {
    const idx = current.findIndex((c) => c.name === catName);
    if (idx === -1) return;
    const cat = current[idx];
    if (cat.subcategories.some((s) => s.toLowerCase() === sub.toLowerCase())) {
      toast.error("That subcategory already exists");
      return;
    }
    try {
      const next = current.map((c) => c.name === catName ? { ...c, subcategories: [...c.subcategories, sub] } : c);
      await persist(next);
      toast.success(`Subcategory "${sub}" added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add subcategory");
    }
  }

  async function removeSubcategory(catName: string, sub: string) {
    try {
      const next = current.map((c) => c.name === catName ? { ...c, subcategories: c.subcategories.filter((s) => s !== sub) } : c);
      await persist(next);
      toast.success(`"${sub}" removed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
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

  const totalSubcats = current.reduce((sum, c) => sum + c.subcategories.length, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">All categories</CardTitle>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {current.length} categories{totalSubcats > 0 ? `, ${totalSubcats} subcategories` : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {current.length === 0 ? (
            <EmptyState icon={Tag} title="No categories yet" description="Add your first one from the panel on the right." />
          ) : (
            <div className="group grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {current.map((cat) => (
                <CategoryCard
                  key={cat.name}
                  cat={cat}
                  saving={save.isPending}
                  onRemoveCategory={() => removeCategory(cat.name)}
                  onAddSubcategory={(sub) => addSubcategory(cat.name, sub)}
                  onRemoveSubcategory={(sub) => removeSubcategory(cat.name, sub)}
                />
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
                className="h-10"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
              />
            </div>
            <Button className="w-full" onClick={addCategory} disabled={save.isPending || !newCategory.trim()}>
              <Plus className="size-4" /> Add category
            </Button>
            <p className="text-xs text-muted-foreground">
              To add subcategories, hover over a category card and click the <Plus className="inline size-3" /> icon.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
