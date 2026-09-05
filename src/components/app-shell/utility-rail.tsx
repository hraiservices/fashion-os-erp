"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles, StickyNote, Settings, Calculator as CalculatorIcon, History, Keyboard, ChevronLeft, ChevronRight, Delete } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isModuleEnabled, DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { useScratchpadNote } from "@/hooks/use-scratchpad-note";
import { useCopilotOpen } from "@/components/app-shell/copilot-context";
import { buildSupportWhatsAppHref } from "@/components/app-shell/copilot-bubble";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "utility-rail:collapsed";
const RAIL_BUTTON_CLASS = "size-10 text-foreground/70 hover:bg-foreground/10 hover:text-foreground";

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
function RailButton({ label, onClick, href, children }: { label: string; onClick?: () => void; href?: string; children: ReactNode }) {
  const buttonEl = href ? (
    <Button type="button" variant="ghost" size="icon" aria-label={label} nativeButton={false} render={<Link href={href} />} className={RAIL_BUTTON_CLASS}>
      {children}
    </Button>
  ) : (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} className={RAIL_BUTTON_CLASS}>
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
function RailPopoverButton({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} className={RAIL_BUTTON_CLASS}>
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

/** Notes popover — autosaves 800ms after the last keystroke, no explicit Save button (the
 *  whole point is "always be saved"). Loads the account's existing note on open. */
function NotesPopover() {
  const { data: note, isLoading, save } = useScratchpadNote();
  const [draft, setDraft] = useState("");
  const [synced, setSynced] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adjust local state during render (React's documented pattern for "initialize once a value
  // arrives") rather than in an effect, once the account's saved note has actually loaded —
  // avoids a spurious extra render pass from setState-in-effect.
  if (!synced && !isLoading && note !== undefined) {
    setSynced(true);
    setDraft(note);
  }

  function onChange(value: string) {
    setDraft(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save.mutate(value), 800);
  }

  return (
    <div className="w-72 space-y-1.5 p-1">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-muted-foreground">My notes</p>
        <span className="text-[10px] text-muted-foreground">{save.isPending ? "Saving…" : "Saved"}</span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Jot anything down — it's saved automatically and stays on your account."
        rows={8}
        className="w-full resize-none rounded-lg border bg-background p-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
      />
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
          <RailButton label="WhatsApp support" onClick={() => window.open(waHref, "_blank", "noopener,noreferrer")}>
            <WhatsAppIcon className="size-[18px] text-[#25D366]" />
          </RailButton>

          {canUseCopilot && (
            <RailButton label="AI Copilot" onClick={() => setCopilotOpen((o) => !o)}>
              <Sparkles className="size-[18px] text-primary" />
            </RailButton>
          )}

          <RailPopoverButton label="My notes" icon={<StickyNote className="size-[18px]" />}>
            <NotesPopover />
          </RailPopoverButton>

          <RailPopoverButton label="Calculator" icon={<CalculatorIcon className="size-[18px]" />}>
            <CalculatorWidget />
          </RailPopoverButton>

          <RailButton label="Activity log" href="/activity-log">
            <History className="size-[18px]" />
          </RailButton>

          <RailButton label="Settings" href="/settings">
            <Settings className="size-[18px]" />
          </RailButton>

          <RailPopoverButton label="Help & tips" icon={<Keyboard className="size-[18px]" />}>
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
