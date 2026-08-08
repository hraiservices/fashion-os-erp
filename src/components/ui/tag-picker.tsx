"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const STARTER_TAGS = ["VIP", "Regular", "At-Risk", "New", "High-Value"];

const TAG_COLORS: Record<string, string> = {
  VIP: "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  "At-Risk": "border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  "High-Value": "border-violet-500/30 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
};

export function tagBadgeClass(tag: string): string {
  return TAG_COLORS[tag] || "";
}

/** Reusable tag multi-picker: shows selected tags as removable badges, "+" opens a panel to toggle starter tags or add a custom one. */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
  }

  function addCustom() {
    const t = custom.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setCustom("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((tag) => (
        <Badge key={tag} variant="outline" className={tagBadgeClass(tag)}>
          {tag}
          <button type="button" onClick={() => toggle(tag)} aria-label={`Remove ${tag}`} className="ml-0.5 opacity-60 hover:opacity-100">
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs">
              <Plus className="size-3" /> Tag
            </Button>
          }
        />
        <PopoverContent align="start" className="w-56">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {STARTER_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                    value.includes(tag) ? `${tagBadgeClass(tag) || "border-primary/40 bg-primary/10 text-primary"}` : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Input
                placeholder="Custom tag…"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                className="h-7 text-xs"
              />
              <Button type="button" size="sm" className="h-7 px-2" onClick={addCustom} disabled={!custom.trim()}>
                Add
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
