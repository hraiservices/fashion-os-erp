// Personal, per-device text size — unlike Settings → Font's "Base size" (shop-wide, saved to
// app_settings, same for every login), this is each person's own calibration for their own
// phone/eyesight, stored only in this browser's localStorage, exactly like the light/dark
// toggle in theme-toggle.tsx. It multiplies whatever the shop's base size already is, via the
// --text-scale CSS var (see globals.css's `html` rule), so it composes with everything else
// instead of replacing it.

export interface TextSizeOption {
  id: string;
  name: string;
  /** Multiplies the effective root font-size (which itself is already fluid by viewport width
   *  and keyed off the shop's chosen base size) — see globals.css. */
  scale: number;
}

export const TEXT_SIZES: TextSizeOption[] = [
  { id: "small", name: "Small", scale: 0.875 },
  { id: "default", name: "Default", scale: 1 },
  { id: "large", name: "Large", scale: 1.125 },
];

export const DEFAULT_TEXT_SIZE = "default";

export const TEXT_SIZE_STORAGE_KEY = "text-size";

export function isValidTextSize(id: string): boolean {
  return TEXT_SIZES.some((t) => t.id === id);
}

export function textSizeScale(id: string): number {
  return TEXT_SIZES.find((t) => t.id === id)?.scale ?? 1;
}

/** Applies a text size to this device (CSS var on <html>) and remembers it for next time. Safe
 *  to call from a plain click handler — nothing async, nothing that can reject. */
export function applyTextSize(id: string): void {
  const scale = textSizeScale(id);
  document.documentElement.style.setProperty("--text-scale", String(scale));
  try {
    localStorage.setItem(TEXT_SIZE_STORAGE_KEY, id);
  } catch {
    // Private browsing / storage disabled — the CSS var is still applied for this session.
  }
}

/** What this device last chose, if anything — read on mount so the picker shows the right
 *  option selected (the blocking script in layout.tsx already applied it to the DOM before
 *  React even mounts, this is just for the UI's own state). */
export function readTextSize(): string {
  try {
    const stored = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    return stored && isValidTextSize(stored) ? stored : DEFAULT_TEXT_SIZE;
  } catch {
    return DEFAULT_TEXT_SIZE;
  }
}
