"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles, StickyNote, Settings, Calculator as CalculatorIcon, History, Keyboard, ChevronLeft, ChevronRight, Delete, Plus, MoreVertical, Copy, Trash2, Check, Table2, Pencil } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isModuleEnabled, DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { useNotes } from "@/hooks/use-notes";
import { useMiniSheets } from "@/hooks/use-mini-sheets";
import { NOTE_COLORS, type Note, type NoteColor, type MiniSheet } from "@/lib/types";
import { COLS, ROWS, cellId, evalSheet, normalizeCells, autoRangeAbove, type CellData } from "@/lib/mini-sheet";
import { useCopilotOpen } from "@/components/app-shell/copilot-context";
import { buildSupportWhatsAppHref } from "@/components/app-shell/copilot-bubble";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "utility-rail:collapsed";

/** Each rail icon gets its own color (the ask was "make all icons colorful") — text tint plus a
 *  matching faint hover wash, rather than one flat gray for everything. */
const TINTS = {
  green: "text-[#25D366] hover:bg-[#25D366]/10",
  violet: "text-violet-500 hover:bg-violet-500/10",
  amber: "text-amber-500 hover:bg-amber-500/10",
  blue: "text-blue-500 hover:bg-blue-500/10",
  teal: "text-teal-500 hover:bg-teal-500/10",
  indigo: "text-indigo-500 hover:bg-indigo-500/10",
  rose: "text-rose-500 hover:bg-rose-500/10",
  emerald: "text-emerald-500 hover:bg-emerald-500/10",
} as const;
type Tint = keyof typeof TINTS;

const NOTE_CARD_CLASSES: Record<NoteColor, string> = {
  yellow: "bg-amber-100 border-amber-200",
  green: "bg-emerald-100 border-emerald-200",
  blue: "bg-sky-100 border-sky-200",
  pink: "bg-pink-100 border-pink-200",
  purple: "bg-violet-100 border-violet-200",
  orange: "bg-orange-100 border-orange-200",
};

const NOTE_SWATCH_CLASSES: Record<NoteColor, string> = {
  yellow: "bg-amber-400",
  green: "bg-emerald-400",
  blue: "bg-sky-400",
  pink: "bg-pink-400",
  purple: "bg-violet-400",
  orange: "bg-orange-400",
};

function loadCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Collapsed state lives in the layout (not inside UtilityRail itself) so the main content
 *  column can reserve/release the same 56px on the right as the rail expands/collapses —
 *  otherwise the rail would float over whatever happened to be at the page's right edge. */
export function useUtilityRailCollapsed() {
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Private-browsing/storage-blocked — the toggle still works for this session.
      }
      return next;
    });
  }

  return { collapsed, toggle };
}

/** A rail icon that either navigates (href) or fires a click handler, with a hover tooltip —
 *  every button on this 56px-wide rail is icon-only, so the tooltip is the only label a mouse
 *  user gets (touch has no hover, but this rail is desktop-only anyway). */
function RailButton({ label, onClick, href, tint, children }: { label: string; onClick?: () => void; href?: string; tint: Tint; children: ReactNode }) {
  const className = cn("size-10", TINTS[tint]);
  const buttonEl = href ? (
    <Button type="button" variant="ghost" size="icon" aria-label={label} nativeButton={false} render={<Link href={href} />} className={className}>
      {children}
    </Button>
  ) : (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} className={className}>
      {children}
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger render={buttonEl} />
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

/** A rail icon that opens a popover panel (Notes, Calculator, Help) — same visual button, no
 *  separate tooltip layered on top of the popover trigger; the icon plus the panel that opens
 *  is label enough, and `title` gives a free native hover hint. */
function RailPopoverButton({ label, icon, tint, children }: { label: string; icon: ReactNode; tint: Tint; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} className={cn("size-10", TINTS[tint])}>
            {icon}
          </Button>
        }
      />
      <PopoverContent side="left" align="start" className="w-auto p-2">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** One sticky note — autosaves 600ms after the last keystroke (no explicit Save button), plus a
 *  "…" menu for copy/re-color/delete. Local `content` state exists purely so typing feels
 *  instant; the account-side value only catches up after the debounce fires. */
function NoteCard({ note, onUpdate, onDelete }: { note: Note; onUpdate: (patch: { content?: string; color?: NoteColor }) => void; onDelete: () => void }) {
  const [content, setContent] = useState(note.content);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(value: string) {
    setContent(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onUpdate({ content: value }), 600);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard permission denied/unavailable — nothing else to fall back to here.
    }
  }

  return (
    <div className={cn("relative rounded-lg border p-2.5 pr-7", NOTE_CARD_CLASSES[note.color])}>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type a note…"
        rows={3}
        className="w-full resize-none bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-500"
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" aria-label="Note options" className="absolute right-1.5 top-1.5 rounded p-0.5 text-neutral-500 hover:bg-black/10 hover:text-neutral-800">
              <MoreVertical className="size-3.5" />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
          </DropdownMenuItem>
          <div className="flex items-center gap-1.5 px-1.5 py-2">
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color: ${c}`}
                onClick={() => onUpdate({ color: c })}
                className={cn("size-4 rounded-full ring-1 ring-black/10", NOTE_SWATCH_CLASSES[c], note.color === c && "ring-2 ring-offset-1 ring-foreground")}
              />
            ))}
          </div>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="size-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Notes popover — a small notebook, not one scratchpad: add as many colored sticky notes as
 *  needed, each independently editable/copyable/deletable, all saved to the account. */
function NotesPopover() {
  const { data: notes, isLoading, create, update, remove } = useNotes();

  return (
    <div className="flex max-h-[70vh] w-80 flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="text-xs font-semibold text-muted-foreground">My notes</p>
        <Button type="button" variant="outline" size="icon-sm" aria-label="Add note" disabled={create.isPending} onClick={() => create.mutate("yellow")}>
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div className="space-y-2 overflow-y-auto p-1">
        {isLoading && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && !notes?.length && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">No notes yet — tap + to add one.</p>
        )}
        {notes?.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onUpdate={(patch) => update.mutate({ id: note.id, ...patch })}
            onDelete={() => remove.mutate(note.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Basic four-function calculator — chained left-to-right (no operator precedence), same as any
 *  physical desk calculator; not meant to replace a spreadsheet formula. Also usable entirely
 *  from a physical keyboard (digits, + - * /, Enter/= , Backspace, Escape/C to clear) once the
 *  popover is open — see onKeyDown below. */
function CalculatorWidget() {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<"+" | "-" | "×" | "÷" | null>(null);
  const [freshEntry, setFreshEntry] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Grab focus as soon as the popover opens so keyboard input works immediately, without the
  // user having to click a key first.
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  function inputDigit(d: string) {
    if (freshEntry) {
      setDisplay(d === "." ? "0." : d);
      setFreshEntry(false);
    } else {
      if (d === "." && display.includes(".")) return;
      setDisplay((v) => (v === "0" && d !== "." ? d : v + d));
    }
  }

  function applyPending(current: number): number {
    if (stored === null || pendingOp === null) return current;
    switch (pendingOp) {
      case "+": return stored + current;
      case "-": return stored - current;
      case "×": return stored * current;
      case "÷": return current === 0 ? NaN : stored / current;
    }
  }

  function chooseOp(op: "+" | "-" | "×" | "÷") {
    const current = parseFloat(display);
    const result = applyPending(current);
    setStored(result);
    setPendingOp(op);
    setDisplay(String(result));
    setFreshEntry(true);
  }

  function equals() {
    const current = parseFloat(display);
    const result = applyPending(current);
    setDisplay(Number.isNaN(result) ? "Error" : String(result));
    setStored(null);
    setPendingOp(null);
    setFreshEntry(true);
  }

  function clearAll() {
    setDisplay("0");
    setStored(null);
    setPendingOp(null);
    setFreshEntry(true);
  }

  function backspace() {
    if (freshEntry) return;
    setDisplay((v) => (v.length > 1 ? v.slice(0, -1) : "0"));
  }

  const keyClass = "h-10 rounded-lg text-sm font-medium hover:bg-muted";

  const OP_KEYS: Record<string, "+" | "-" | "×" | "÷"> = { "+": "+", "-": "-", "*": "×", "/": "÷" };

  // Physical keyboard support — digits, the four operators (+-*/), Enter/= to compute,
  // Backspace, and Escape/C to clear. Scoped to this popover's own container (not window) so
  // typing elsewhere on the page never gets hijacked by an open-but-unfocused calculator.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const { key } = e;
    if (/^[0-9]$/.test(key) || key === ".") {
      e.preventDefault();
      inputDigit(key);
    } else if (key in OP_KEYS) {
      e.preventDefault();
      chooseOp(OP_KEYS[key]);
    } else if (key === "Enter" || key === "=") {
      e.preventDefault();
      equals();
    } else if (key === "Backspace") {
      e.preventDefault();
      backspace();
    } else if (key === "Escape" || key.toLowerCase() === "c") {
      e.preventDefault();
      clearAll();
    }
  }

  return (
    <div ref={containerRef} className="w-64 space-y-2 p-1 outline-none" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="rounded-lg border bg-background px-3 py-2.5 text-right text-xl font-semibold tabular-nums">{display}</div>
      <div className="grid grid-cols-4 gap-1.5">
        <Button type="button" variant="outline" className={keyClass} onClick={clearAll}>C</Button>
        <Button type="button" variant="outline" className={keyClass} onClick={backspace} aria-label="Backspace">
          <Delete className="size-4" />
        </Button>
        <Button type="button" variant="outline" className={keyClass} onClick={() => chooseOp("÷")}>÷</Button>
        <Button type="button" variant="outline" className={keyClass} onClick={() => chooseOp("×")}>×</Button>
        {["7", "8", "9"].map((d) => (
          <Button key={d} type="button" variant="ghost" className={keyClass} onClick={() => inputDigit(d)}>{d}</Button>
        ))}
        <Button type="button" variant="outline" className={keyClass} onClick={() => chooseOp("-")}>−</Button>
        {["4", "5", "6"].map((d) => (
          <Button key={d} type="button" variant="ghost" className={keyClass} onClick={() => inputDigit(d)}>{d}</Button>
        ))}
        <Button type="button" variant="outline" className={keyClass} onClick={() => chooseOp("+")}>+</Button>
        {["1", "2", "3"].map((d) => (
          <Button key={d} type="button" variant="ghost" className={keyClass} onClick={() => inputDigit(d)}>{d}</Button>
        ))}
        <Button type="button" variant="default" className={cn(keyClass, "row-span-2 h-auto")} onClick={equals}>=</Button>
        <Button type="button" variant="ghost" className={cn(keyClass, "col-span-2")} onClick={() => inputDigit("0")}>0</Button>
        <Button type="button" variant="ghost" className={keyClass} onClick={() => inputDigit(".")}>.</Button>
      </div>
    </div>
  );
}

/** One editable cell — shows the raw formula/text while focused, the computed value otherwise.
 *  Enter moves focus to the cell below, Tab to the cell on the right (both native browser
 *  behavior for Tab, Enter handled here), matching how a real spreadsheet feels to move through. */
function SheetCell({
  id,
  data,
  display,
  isError,
  onCommitValue,
  onSelect,
}: {
  id: string;
  data: CellData;
  display: string;
  isError: boolean;
  onCommitValue: (value: string) => void;
  onSelect: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.value);

  function commitIfChanged() {
    setEditing(false);
    if (value !== data.value) onCommitValue(value);
  }

  function focusCell(targetId: string) {
    const el = document.getElementById(`sheet-cell-${targetId}`);
    if (el instanceof HTMLInputElement) el.focus();
  }

  return (
    <input
      id={`sheet-cell-${id}`}
      value={editing ? value : display}
      onFocus={() => {
        setValue(data.value);
        setEditing(true);
        onSelect();
      }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commitIfChanged}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
          const m = /^([A-H])([0-9]+)$/.exec(id);
          if (m) focusCell(cellId(m[1], Math.min(ROWS, parseInt(m[2], 10) + 1)));
        } else if (e.key === "Escape") {
          setValue(data.value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      style={{
        fontWeight: data.bold ? 700 : undefined,
        fontStyle: data.italic ? "italic" : undefined,
        color: !editing && !isError ? data.color : undefined,
        backgroundColor: !editing ? data.bg : undefined,
      }}
      className={cn(
        "h-7 w-16 shrink-0 border border-border/60 bg-background px-1 text-right text-xs tabular-nums outline-none focus:relative focus:z-10 focus:border-primary focus:ring-1 focus:ring-primary",
        !editing && isError && "text-destructive",
      )}
    />
  );
}

const SHEET_TEXT_COLORS = ["#0f172a", "#dc2626", "#16a34a", "#2563eb", "#9333ea", "#ea580c"];
const SHEET_BG_COLORS = ["", "#fef9c3", "#dcfce7", "#dbeafe", "#fce7f3", "#fed7aa"];

/** Sheets popover — a small multi-sheet spreadsheet (8 columns × 15 rows, basic arithmetic with
 *  cell refs and SUM/PRODUCT/AVERAGE/MIN/MAX over a range) for quick tallies that need more
 *  structure than a sticky note but don't warrant leaving the app.
 *
 *  Cell edits apply to local `cells` state immediately (so the grid never waits on a network
 *  round trip to show what was just typed) and are pushed to the server 600ms after the last
 *  edit, same debounce convention as NoteCard — the earlier version skipped the local state and
 *  read straight from the last server response, which both delayed the display by a full
 *  save+refetch cycle AND could drop a rapid second edit: two edits within the debounce window
 *  each rebuilt their "next cells" from the same stale server snapshot, so the later save
 *  silently overwrote the earlier one. */
function SheetsPopover() {
  const { data: sheets, isLoading, create, update, remove } = useMiniSheets();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [cells, setCells] = useState<Record<string, CellData>>({});
  const [loadedSheetId, setLoadedSheetId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCellsRef = useRef<Record<string, CellData> | null>(null);

  const active = sheets?.find((s) => s.id === activeId) ?? sheets?.[0] ?? null;

  // Reload local `cells` from the server only when switching to a different sheet — never on a
  // background refetch of the sheet currently being edited, which would stomp the local
  // authoritative copy with a slightly stale server echo. Adjusting state during render (rather
  // than in an effect) on a prop/id change is the pattern React itself recommends for this.
  if (active && active.id !== loadedSheetId) {
    setLoadedSheetId(active.id);
    setCells(normalizeCells(active.cells));
  }

  const rawValues = useMemo(() => Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, c.value])), [cells]);
  const computed = useMemo(() => evalSheet(rawValues), [rawValues]);

  function scheduleSave(sheet: MiniSheet, nextCells: Record<string, CellData>) {
    pendingCellsRef.current = nextCells;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (pendingCellsRef.current) update.mutate({ id: sheet.id, cells: pendingCellsRef.current });
      pendingCellsRef.current = null;
    }, 600);
  }

  function patchCell(ref: string, patch: Partial<CellData>) {
    if (!active) return;
    setCells((prev) => {
      const merged: CellData = { ...(prev[ref] || { value: "" }), ...patch };
      const next = { ...prev };
      if (!merged.value.trim() && !merged.bold && !merged.italic && !merged.color && !merged.bg) delete next[ref];
      else next[ref] = merged;
      scheduleSave(active, next);
      return next;
    });
  }

  function toggleSelectedFormat(key: "bold" | "italic") {
    if (!selectedCell) return;
    patchCell(selectedCell, { [key]: !cells[selectedCell]?.[key] });
  }

  function setSelectedColor(key: "color" | "bg", value: string) {
    if (!selectedCell) return;
    patchCell(selectedCell, { [key]: value || undefined });
  }

  function insertAutoFormula(fn: "SUM" | "PRODUCT") {
    if (!selectedCell) return;
    const range = autoRangeAbove(selectedCell, cells);
    patchCell(selectedCell, { value: range ? `=${fn}(${range})` : `=${fn}()` });
  }

  async function addSheet() {
    const res = await create.mutateAsync(`Sheet ${(sheets?.length || 0) + 1}`);
    setActiveId(res.id);
  }

  function startRename() {
    if (!active) return;
    setNameDraft(active.name);
    setRenaming(true);
  }

  function commitRename() {
    setRenaming(false);
    if (active && nameDraft.trim() && nameDraft.trim() !== active.name) {
      update.mutate({ id: active.id, name: nameDraft.trim() });
    }
  }

  const selectedData = selectedCell ? cells[selectedCell] : undefined;

  return (
    <div className="w-[560px] space-y-2 p-1">
      <div className="flex items-center gap-1.5">
        {renaming ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === "Enter" && commitRename()}
            className="h-7 min-w-0 flex-1 rounded border bg-background px-2 text-xs font-medium outline-none focus:border-primary"
          />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="outline" size="sm" className="h-7 min-w-0 flex-1 justify-start text-xs font-medium">
                  <span className="truncate">{active?.name || "No sheets"}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {sheets?.map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => setActiveId(s.id)}>
                  <span className="truncate">{s.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {active && !renaming && (
          <Button type="button" variant="outline" size="icon-sm" aria-label="Rename sheet" onClick={startRename}>
            <Pencil className="size-3.5" />
          </Button>
        )}
        <Button type="button" variant="outline" size="icon-sm" aria-label="Add sheet" disabled={create.isPending} onClick={addSheet}>
          <Plus className="size-3.5" />
        </Button>
        {active && (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Delete sheet"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate(active.id);
              setActiveId(null);
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {active && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-1">
          <Button
            type="button"
            variant={selectedData?.bold ? "default" : "outline"}
            size="icon-sm"
            aria-label="Bold"
            disabled={!selectedCell}
            onClick={() => toggleSelectedFormat("bold")}
            className="font-bold"
          >
            B
          </Button>
          <Button
            type="button"
            variant={selectedData?.italic ? "default" : "outline"}
            size="icon-sm"
            aria-label="Italic"
            disabled={!selectedCell}
            onClick={() => toggleSelectedFormat("italic")}
            className="italic"
          >
            I
          </Button>

          <div className="mx-1 h-5 w-px bg-border" />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="outline" size="icon-sm" aria-label="Text color" disabled={!selectedCell} className="relative">
                  <span className="text-xs font-semibold">A</span>
                  <span className="absolute inset-x-1.5 bottom-1 h-0.5 rounded-full" style={{ backgroundColor: selectedData?.color || "currentColor" }} />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                <button
                  type="button"
                  aria-label="Default text color"
                  onClick={() => setSelectedColor("color", "")}
                  className="flex size-5 items-center justify-center rounded-full border border-border/60 text-[10px] text-muted-foreground"
                >
                  ×
                </button>
                {SHEET_TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Text color ${c}`}
                    onClick={() => setSelectedColor("color", c)}
                    style={{ backgroundColor: c }}
                    className={cn("size-5 rounded-full ring-1 ring-black/10", selectedData?.color === c && "ring-2 ring-offset-1 ring-foreground")}
                  />
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="outline" size="icon-sm" aria-label="Cell background color" disabled={!selectedCell} className="relative">
                  <span
                    className="size-3.5 rounded-sm border border-border/60"
                    style={{ backgroundColor: selectedData?.bg || "transparent" }}
                  />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                {SHEET_BG_COLORS.map((c) => (
                  <button
                    key={c || "none"}
                    type="button"
                    aria-label={c ? `Background ${c}` : "No background"}
                    onClick={() => setSelectedColor("bg", c)}
                    style={{ backgroundColor: c || "transparent" }}
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border border-border/60 ring-1 ring-black/10",
                      (selectedData?.bg || "") === c && "ring-2 ring-offset-1 ring-foreground",
                    )}
                  >
                    {!c && <span className="text-[10px] text-muted-foreground">×</span>}
                  </button>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="mx-1 h-5 w-px bg-border" />

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!selectedCell}
            title="Sum the filled cells directly above the selected cell"
            onClick={() => insertAutoFormula("SUM")}
          >
            <span className="font-serif italic">Σ</span> SUM
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!selectedCell}
            title="Multiply the filled cells directly above the selected cell"
            onClick={() => insertAutoFormula("PRODUCT")}
          >
            <span className="font-serif italic">Π</span> PRODUCT
          </Button>
        </div>
      )}

      {isLoading && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Loading…</p>}
      {!isLoading && !sheets?.length && (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">No sheets yet — tap + to add one.</p>
      )}
      {!isLoading && active && (
        <div className="max-h-[70vh] overflow-auto rounded-lg border">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 h-6 w-8 border border-border/60 bg-muted text-[10px] font-medium text-muted-foreground" />
                {COLS.map((c) => (
                  <th key={c} className="sticky top-0 z-10 h-6 w-16 border border-border/60 bg-muted text-[10px] font-medium text-muted-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS }, (_, i) => i + 1).map((row) => (
                <tr key={row}>
                  <th className="sticky left-0 z-10 h-7 w-8 border border-border/60 bg-muted text-[10px] font-medium text-muted-foreground">{row}</th>
                  {COLS.map((col) => {
                    const id = cellId(col, row);
                    const data = cells[id] || { value: "" };
                    const display = computed[id] ?? data.value;
                    return (
                      <td key={id} className="p-0">
                        <SheetCell
                          id={id}
                          data={data}
                          display={display}
                          isError={display.startsWith("#")}
                          onCommitValue={(value) => patchCell(id, { value })}
                          onSelect={() => setSelectedCell(id)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-1 text-[11px] text-muted-foreground">Start a cell with &quot;=&quot; for a formula, e.g. =A1+B2 or =SUM(A1:A5).</p>
    </div>
  );
}

function HelpPopover({ waHref }: { waHref: string }) {
  return (
    <div className="w-72 space-y-2.5 p-1">
      <p className="text-xs font-semibold text-muted-foreground">Tips</p>
      <ul className="space-y-2 text-sm">
        <li>• Type a customer&apos;s name or mobile number in any search box to find them fast.</li>
        <li>• On the Orders board, drag a card to a new column to change its stage.</li>
        <li>• Ask the AI Copilot things like &quot;overdue orders&quot; or &quot;this month&apos;s revenue&quot; in plain Hindi or English.</li>
        <li>• Your notes (the sticky-note icon) autosave and follow you across devices.</li>
      </ul>
      <a href={waHref} target="_blank" rel="noopener noreferrer" className="block text-xs font-medium text-primary hover:underline">
        Still stuck? Message support on WhatsApp →
      </a>
    </div>
  );
}

/**
 * Desktop-only collapsible utility rail docked to the right edge — replaces the old floating
 * WhatsApp/Copilot circles (see copilot-bubble.tsx) with one consistent strip of icons, styled
 * after the vertical widget rail on Zoho Books' desktop app. Always renders light/semi-
 * transparent regardless of the app's own light/dark theme — a deliberate, fixed look for this
 * one piece of chrome, not something that should shift with the page underneath it.
 */
export function UtilityRail({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  const { data: user } = useCurrentUser();
  const { data: shop } = useShopSettings();
  const { data: entitlements } = useModuleEntitlements();
  const { setOpen: setCopilotOpen } = useCopilotOpen();

  const canUseCopilot = !!user?.perms.useChatbot && isModuleEnabled(entitlements ?? DEFAULT_ENTITLEMENTS, "copilot");
  const waHref = buildSupportWhatsAppHref(shop?.name);

  return (
    <div className="fixed inset-y-0 right-0 z-40 hidden lg:flex print:hidden">
      {collapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Show utility panel"
          className="my-auto flex h-16 w-4 items-center justify-center rounded-l-md border border-r-0 bg-white/70 text-foreground/50 backdrop-blur-md hover:bg-white/90 hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      ) : (
        <div className="flex w-14 flex-col items-center gap-1 border-l bg-white/70 py-3 shadow-[-2px_0_8px_rgba(0,0,0,0.04)] backdrop-blur-md">
          <RailButton label="WhatsApp support" tint="green" onClick={() => window.open(waHref, "_blank", "noopener,noreferrer")}>
            <WhatsAppIcon className="size-[18px]" />
          </RailButton>

          {canUseCopilot && (
            <RailButton label="AI Copilot" tint="violet" onClick={() => setCopilotOpen((o) => !o)}>
              <Sparkles className="size-[18px]" />
            </RailButton>
          )}

          <RailPopoverButton label="My notes" tint="amber" icon={<StickyNote className="size-[18px]" />}>
            <NotesPopover />
          </RailPopoverButton>

          <RailPopoverButton label="Calculator" tint="blue" icon={<CalculatorIcon className="size-[18px]" />}>
            <CalculatorWidget />
          </RailPopoverButton>

          <RailPopoverButton label="Sheets" tint="emerald" icon={<Table2 className="size-[18px]" />}>
            <SheetsPopover />
          </RailPopoverButton>

          <RailButton label="Activity log" tint="teal" href="/activity-log">
            <History className="size-[18px]" />
          </RailButton>

          <RailButton label="Settings" tint="indigo" href="/settings">
            <Settings className="size-[18px]" />
          </RailButton>

          <RailPopoverButton label="Help & tips" tint="rose" icon={<Keyboard className="size-[18px]" />}>
            <HelpPopover waHref={waHref} />
          </RailPopoverButton>

          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Hide utility panel"
            className="mt-auto flex size-8 items-center justify-center rounded-full text-foreground/40 hover:bg-foreground/10 hover:text-foreground"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
