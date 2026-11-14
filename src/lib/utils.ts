import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Shared tap/click press feedback for a plain link or toggle button that isn't already a
 * <Button> (which has its own active:scale-[0.97] treatment in button.tsx) — a brief
 * scale-down + opacity dip on press, so clicking something visibly registers before whatever
 * it does (navigate, expand) actually happens. transform/opacity only, never a layout
 * property, so this stays smooth on a mid-range phone rather than relying on this dev
 * machine's own GPU. Respects prefers-reduced-motion globally via globals.css, not per-use.
 *
 * `transition-all` (not the more surgical `transition-[transform,opacity]`) deliberately —
 * tailwind-merge treats any `transition-*` utility as one conflicting group, so a narrower one
 * combined with a caller's own `transition-colors` would silently drop whichever came first
 * instead of combining; `transition-all` is a superset of both, so it never needs to win a
 * fight it would otherwise lose. Matches the same pattern button.tsx already uses.
 */
export const PRESS_FEEDBACK = "transition-all duration-100 active:scale-[0.98] active:opacity-80";
