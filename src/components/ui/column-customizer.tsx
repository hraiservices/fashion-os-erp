"use client";

import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useColumnVisibility } from "@/hooks/use-column-visibility";

/** Gear-icon menu to show/hide table columns — pair with useColumnVisibility(). */
export function ColumnCustomizerMenu({ table }: { table: ReturnType<typeof useColumnVisibility> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Customize columns">
            <Settings2 className="size-4" /> Columns
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {table.columns.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.key}
            checked={table.isVisible(col.key)}
            disabled={col.required}
            onCheckedChange={() => table.toggle(col.key)}
            onSelect={(e) => e.preventDefault()}
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
        {table.hiddenCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={table.resetAll}
              className="w-full rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Show all columns
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
