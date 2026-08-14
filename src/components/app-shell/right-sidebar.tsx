"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { StickyNote } from "lucide-react";
import { QuickNotesPanel } from "@/components/app-shell/quick-notes-panel";
import { cn } from "@/lib/utils";

/**
 * Registry of right-sidebar tools — add a new entry here (icon + panel) to add a new tool to
 * the rail. Only one panel is open at a time; the rail itself is always visible on desktop.
 */
interface RailItem {
  key: string;
  label: string;
  icon: LucideIcon;
  panel: (props: { onClose: () => void }) => React.ReactNode;
}

const RAIL_ITEMS: RailItem[] = [
  { key: "notes", label: "Notes", icon: StickyNote, panel: ({ onClose }) => <QuickNotesPanel onClose={onClose} /> },
];

/** Persistent vertical icon rail docked to the right edge — desktop only. Clicking an icon
 *  slides open its panel immediately to the left of the rail; clicking again (or the panel's
 *  own close button) closes it. */
export function RightSidebar() {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Keeps the last-opened item's content rendered while the panel slides shut, instead of
  // unmounting instantly and leaving a blank rectangle mid-animation.
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const isOpen = activeKey !== null;
  const rendered = RAIL_ITEMS.find((i) => i.key === renderedKey);

  function toggle(key: string) {
    const opening = activeKey !== key;
    setActiveKey(opening ? key : null);
    if (opening) setRenderedKey(key);
  }

  return (
    <div className="hidden lg:block print:hidden">
      {/* Icon rail */}
      <div className="fixed right-0 top-0 z-40 flex h-dvh w-12 flex-col items-center gap-1 border-l bg-card py-4 shadow-sm">
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => toggle(item.key)}
              aria-label={item.label}
              aria-pressed={isActive}
              title={item.label}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg transition-colors",
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4.5" />
            </button>
          );
        })}
      </div>

      {/* Active panel — slides in immediately to the left of the rail (right-12 = rail width). */}
      <div
        className={cn(
          "fixed right-12 top-0 z-40 h-dvh w-80 border-l bg-card shadow-xl transition-transform duration-200",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {rendered && rendered.panel({ onClose: () => setActiveKey(null) })}
      </div>
    </div>
  );
}
