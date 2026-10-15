"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MATERIAL_PRESETS, type MaterialItem, type MaterialKey } from "@/lib/order-materials";

type State = "none" | "awaited" | "received";

const STATES: { value: State; label: string }[] = [
  { value: "none", label: "None" },
  { value: "awaited", label: "Awaited" },
  { value: "received", label: "Received" },
];

function stateOf(items: MaterialItem[], key: MaterialKey): State {
  const it = items.find((i) => i.key === key);
  return !it ? "none" : it.received ? "received" : "awaited";
}

/**
 * The raw-material checklist for an order — lining, buttons, reels, other. Each is "Not needed", "Awaited" (bought
 * or to be bought, not here yet) or "Received". Controlled: the caller owns the list and the note.
 */
export function MaterialsEditor({
  items,
  note,
  onChange,
  onNoteChange,
}: {
  items: MaterialItem[];
  note: string;
  onChange: (items: MaterialItem[]) => void;
  onNoteChange: (note: string) => void;
}) {
  function set(key: MaterialKey, state: State) {
    const rest = items.filter((i) => i.key !== key);
    if (state === "none") return onChange(rest);
    const preset = MATERIAL_PRESETS.find((p) => p.key === key)!;
    const prev = items.find((i) => i.key === key);
    const next: MaterialItem = { key, label: prev?.label || preset.label, received: state === "received", ...(state === "received" && prev?.at ? { at: prev.at } : {}) };
    // Keep the presets in their usual order so the list doesn't jump around as boxes are ticked.
    onChange(MATERIAL_PRESETS.map((p) => (p.key === key ? next : rest.find((i) => i.key === p.key))).filter((i): i is MaterialItem => !!i));
  }

  function rename(label: string) {
    onChange(items.map((i) => (i.key === "other" ? { ...i, label } : i)));
  }

  return (
    <div className="space-y-2.5">
      {MATERIAL_PRESETS.map((p) => {
        const state = stateOf(items, p.key);
        return (
          <div key={p.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium">{p.label}</span>
              <div className="flex w-[15rem] max-w-[70%] shrink-0 rounded-lg border p-0.5" role="group" aria-label={`${p.label} status`}>
                {STATES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => set(p.key, s.value)}
                    aria-pressed={state === s.value}
                    className={cn(
                      "min-h-9 min-w-0 flex-1 truncate rounded-md px-1 text-xs font-medium transition-colors sm:min-h-8",
                      state === s.value
                        ? s.value === "received"
                          ? "bg-emerald-600 text-white"
                          : s.value === "awaited"
                            ? "bg-amber-500 text-white"
                            : "bg-muted"
                        : "text-muted-foreground"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {p.key === "other" && state !== "none" && (
              <Input
                value={items.find((i) => i.key === "other")?.label === "Other" ? "" : items.find((i) => i.key === "other")?.label || ""}
                onChange={(e) => rename(e.target.value.slice(0, 40))}
                placeholder="What is it? e.g. zip, padding"
                aria-label="Other material name"
                className="h-10"
              />
            )}
          </div>
        );
      })}
      <Input value={note} onChange={(e) => onNoteChange(e.target.value.slice(0, 300))} placeholder="Note, e.g. buttons coming Friday" aria-label="Material note" className="h-10" />
    </div>
  );
}
