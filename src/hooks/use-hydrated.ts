"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * False while the server renders and during hydration; true from the first client render after.
 *
 * For the narrow case of a component whose MARKUP depends on something the server can't know —
 * the signed-in user's permissions, a saved preference, a random id. Rendering a guess on the
 * server and the truth on the client makes React report a hydration mismatch and throw the
 * server's HTML away for that whole subtree; gated on this, both sides render the same
 * placeholder and the real thing appears a tick later.
 *
 * React reads this through `getServerSnapshot` on the server and during hydration, so the two
 * agree by construction — unlike a `useState` + `useEffect` mounted flag, which does the same
 * job but trips the "no setState in an effect" rule.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
