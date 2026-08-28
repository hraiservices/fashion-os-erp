import { useState } from "react";

/**
 * Runs `onChange` on mount and whenever `source` changes identity afterwards,
 * without doing it inside a useEffect. Used to mirror an external value (e.g.
 * a query result) into local, independently editable state. This is React's
 * "adjust state during render" pattern: https://react.dev/learn/you-might-not-need-an-effect
 */
export function useSyncFromSource<T>(source: T, onChange: (source: T) => void) {
  const [prev, setPrev] = useState<{ v: T } | null>(null);
  if (prev === null || source !== prev.v) {
    setPrev({ v: source });
    onChange(source);
  }
}
