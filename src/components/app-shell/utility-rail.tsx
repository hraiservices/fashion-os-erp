"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles, StickyNote, Settings, Calculator as CalculatorIcon, History, Keyboard, ChevronLeft, ChevronRight, Delete, Plus, MoreVertical, Copy, Trash2, Check } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isModuleEnabled, DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { useNotes } from "@/hooks/use-notes";
import { NOTE_COLORS, type Note, type NoteColor } from "@/lib/types";
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
 *  physical desk calculator; not meant to replace a spreadsheet formula. */
function CalculatorWidget() {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<"+" | "-" | "×" | "÷" | null>(null);
  const [freshEntry, setFreshEntry] = useState(true);

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

  return (
    <div className="w-64 space-y-2 p-1">
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
