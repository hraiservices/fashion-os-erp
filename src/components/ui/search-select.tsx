"use client";

import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SearchSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  /** Small pill after the label, e.g. "Product" / "Raw material". */
  tag?: string;
}

/** A pinned "+ Add new …" row at the top of the dropdown. */
export interface SearchSelectCreateAction {
  label: string;
  onCreate: (query: string) => void;
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
  onCreateNew,
  createLabel = "Add new item",
  createActions,
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
  /** When set, shows a "+ Add new…" row pinned at the top of the dropdown (with the typed query, if
   *  any) so the user can create a missing item without leaving the form or scrolling to find it. */
  onCreateNew?: (query: string) => void;
  createLabel?: string;
  /** Several pinned "+ Add new …" rows (e.g. "Add new product" and "Add new raw material"). Used instead of onCreateNew. */
  createActions?: SearchSelectCreateAction[];
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions: SearchSelectCreateAction[] = createActions ?? (onCreateNew ? [{ label: createLabel, onCreate: onCreateNew }] : []);
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
      {open && (matches.length > 0 || (query.trim() && matches.length === 0) || actions.length > 0) && (
        // Wider than the (often narrow, in a cramped row) input itself on desktop — a short
        // trigger field shouldn't force a short, hard-to-scan dropdown. Stays input-width on
        // mobile, where the row has no room to spare.
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg sm:min-w-[22rem] sm:max-w-[80vw]">
          {actions.length > 0 && (
            // One sticky block so every "Add new" row stays in view while the matches scroll beneath it.
            <li className="sticky top-0 z-10 border-b bg-popover">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    action.onCreate(query.trim());
                    setQuery("");
                    setEditing(false);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                >
                  <Plus className="size-3.5 shrink-0" />
                  <span className="truncate">{query.trim() ? `${action.label} "${query.trim()}"` : action.label}</span>
                </button>
              ))}
            </li>
          )}
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
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{o.label}</span>
                  {o.tag && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{o.tag}</span>}
                </span>
                {o.sublabel && <span className="text-xs text-muted-foreground">{o.sublabel}</span>}
              </button>
            </li>
          ))}
          {query.trim() && matches.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No matches</li>}
        </ul>
      )}
    </div>
  );
}
