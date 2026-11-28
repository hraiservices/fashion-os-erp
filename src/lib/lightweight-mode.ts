// "Light Weight" mode — personal, per-device, stored only in this browser's localStorage (same
// pattern as text-size.ts and the light/dark toggle). Strips the app down to essentials:
//   - no animations/transitions (globals.css's `.lite-mode` rules)
//   - no avatar/employee photos, just initials (avatar.tsx)
//   - secondary export/print menus hidden (report-actions-menu.tsx)
//   - dashboard "LIVE" background polling paused (chart-widget-kit.tsx's useLiveRefresh)
//   - charts replaced by a plain number/summary (lite-chart-gate.tsx)
//   - data tables collapse to just their `required` columns (use-column-visibility.ts)

export const LITE_MODE_STORAGE_KEY = "lite-mode";
export const LITE_MODE_CHANGE_EVENT = "lite-mode-changed";
const CLASS_NAME = "lite-mode";

export function readLiteMode(): boolean {
  try {
    return localStorage.getItem(LITE_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Applies (or clears) the lite-mode class on <html> and remembers the choice for next time.
 *  Dispatches a same-tab event so every component using useLightweightMode() re-renders — plain
 *  localStorage writes don't fire the `storage` event in the tab that made them. */
export function applyLiteMode(on: boolean): void {
  document.documentElement.classList.toggle(CLASS_NAME, on);
  try {
    localStorage.setItem(LITE_MODE_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Private browsing / storage disabled — the class is still applied for this session.
  }
  window.dispatchEvent(new Event(LITE_MODE_CHANGE_EVENT));
}
