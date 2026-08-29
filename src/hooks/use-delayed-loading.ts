import { useEffect, useState } from "react";

/**
 * Debounces a loading flag so a skeleton only appears once loading has genuinely taken a
 * moment — a query that resolves from cache or over a fast connection in under `delayMs`
 * never shows a skeleton at all, instead of flashing one for a single frame. That flash reads
 * as a glitch; native apps don't show a spinner for something that was already instant.
 */
export function useDelayedLoading(isLoading: boolean, delayMs = 150): boolean {
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    // Both branches set state from inside the timer callback (never synchronously in the effect
    // body) — even the "reset" path, via a 0ms timer, since setting it directly here would still
    // trip react-hooks/set-state-in-effect and risk a cascading render.
    const timer = setTimeout(() => setShowLoading(isLoading), isLoading ? delayMs : 0);
    return () => clearTimeout(timer);
  }, [isLoading, delayMs]);

  return isLoading && showLoading;
}
