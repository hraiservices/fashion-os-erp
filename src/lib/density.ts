/** Applied as a `density-compact` class on <html> — see the `[data-slot="table-*"]` rules in globals.css. */
export const DENSITY_MODES = [
  { id: "comfortable", name: "Comfortable" },
  { id: "compact", name: "Compact" },
] as const;

export const DEFAULT_DENSITY = "comfortable";

export function isValidDensity(id: string): boolean {
  return DENSITY_MODES.some((d) => d.id === id);
}
