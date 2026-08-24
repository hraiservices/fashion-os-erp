"use client";

import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SearchSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

/**
 * Type-and-search select: an input that filters a suggestion list as you type, instead of a
 * dropdown you scroll through. Matches the pattern already used by the barcode/name scan box
 * in ProductLineItemsEditor (onMouseDown, not onClick, on suggestions — fires before the
 * input's onBlur closes the list) rather than introducing a separate popover/combobox pattern.
 */
export function SearchSelect({
  value,
  options,
  onSelect,
  placeholder = "Type to search…",
  className,
  inputClassName,
  maxResults = 50,
  fallbackLabel,
}: {
  /** Currently selected option's value — used to show its label when the field isn't being edited. */
  value: string;
  options: SearchSelectOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  maxResults?: number;
  /** Shown when `value` is set but doesn't match any option — e.g. editing a record whose
   *  selection predates/bypasses the options list (a prefilled name with no real id yet). */
  fallbackLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const displayValue = editing ? query : selected?.label || fallbackLabel || "";

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q)) : options;
    return pool.slice(0, maxResults);
  }, [options, query, maxResults]);

  function pick(o: SearchSelectOption) {
    onSelect(o.value);
    setQuery("");
    setEditing(false);
    setOpen(false);
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={inputRef}
        placeholder={placeholder}
        className={inputClassName}
        value={displayValue}
        onFocus={() => {
          setEditing(true);
          setQuery("");
          setOpen(true);
          setHighlighted(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlighted((h) => Math.min(h + 1, matches.length - 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((h) => Math.max(h - 1, 0));
            return;
          }
          if (e.key === "Enter" && matches.length > 0) {
            e.preventDefault();
            pick(matches[Math.min(highlighted, matches.length - 1)]);
          }
        }}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            setEditing(false);
          }, 150)
        }
      />
      {open && matches.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg">
          {matches.map((o, i) => (
            <li key={o.value}>
              <button
                type="button"
                // onMouseDown, not onClick — fires before the input's onBlur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setHighlighted(i)}
                className={cn("flex w-full flex-col px-3 py-2 text-left text-sm", i === highlighted ? "bg-muted" : "hover:bg-muted")}
              >
                <span className="truncate">{o.label}</span>
                {o.sublabel && <span className="text-xs text-muted-foreground">{o.sublabel}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-lg border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-lg">No matches</div>
      )}
    </div>
  );
}
