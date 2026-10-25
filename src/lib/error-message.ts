/**
 * `fetch()` itself rejects with a generic `TypeError` when the request never reaches a server —
 * offline, DNS failure, a dropped mobile connection mid-request — before any response (and so
 * any server-authored error message) exists. That TypeError's own message is opaque and
 * platform-specific ("Failed to fetch" on Chrome, "Load failed" on Safari, "NetworkError when
 * attempting to fetch resource" on Firefox), so surfacing it as-is in a toast reads like a bug
 * rather than a connectivity problem — which matters here since shop staff are often on patchy
 * mobile data. This also checks `navigator.onLine`, since a request can fail for the same reason
 * without even reaching the TypeError-throwing stage (e.g. aborted immediately by the browser).
 */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (e instanceof TypeError) {
    const msg = e.message.toLowerCase();
    return msg.includes("fetch") || msg.includes("network") || msg.includes("load failed");
  }
  return false;
}

export const OFFLINE_MESSAGE = "No connection — check your network and try again.";

/** Turns a caught value into a toast-ready string. A detected network failure (see
 *  `isNetworkError`) always gets the same clear, actionable message instead of the platform's
 *  opaque fetch-failure text; everything else keeps the existing `e.message` behavior. */
export function getErrorMessage(e: unknown, fallback: string): string {
  if (isNetworkError(e)) return OFFLINE_MESSAGE;
  return e instanceof Error ? e.message : fallback;
}

/** Rethrows a caught fetch-stage error as a friendly `Error` when it's network-related, so every
 *  existing `catch (e) { toast.error(e instanceof Error ? e.message : "...") }` call site in this
 *  app picks up the clear message with no changes of its own — see `postJson`/`patchJson`/
 *  `deleteJson` helpers in the various `use-*-mutations.ts` hook files for the call site. */
export function rethrowFriendly(e: unknown): never {
  if (isNetworkError(e)) throw new Error(OFFLINE_MESSAGE);
  throw e;
}
