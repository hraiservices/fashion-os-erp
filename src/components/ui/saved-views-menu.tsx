"use client";

import { useState } from "react";
import { Bookmark, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SavedView } from "@/hooks/use-saved-views";

/** "Views" dropdown (apply/delete a saved filter preset) + a name input to save the current filters as a new one. */
export function SavedViewsMenu<F>({
  views,
  onApply,
  onSave,
  onRemove,
  currentFilters,
}: {
  views: SavedView<F>[];
  onApply: (filters: F) => void;
  onSave: (name: string, filters: F) => void;
  onRemove: (id: string) => void;
  currentFilters: F;
}) {
  const [name, setName] = useState("");

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, currentFilters);
    setName("");
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" aria-label="Saved views">
              <Bookmark className="size-4" /> Views {views.length > 0 && `(${views.length})`}
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {views.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet — set your filters, then save below.</p>
          ) : (
            views.map((v) => (
              <DropdownMenuItem key={v.id} onClick={() => onApply(v.filters)} className="justify-between">
                <span className="truncate">{v.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(v.id);
                  }}
                  aria-label={`Delete view ${v.name}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex items-center gap-1">
        <Input placeholder="Save current filters as…" className="h-8 w-40 text-xs" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} />
        <Button variant="outline" size="sm" onClick={handleSave} disabled={!name.trim()} aria-label="Save view">
          <Save className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
