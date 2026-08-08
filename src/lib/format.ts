/** Shared formatters — previously each page redefined its own local `inr()`. */

export function inr(n: number): string {
  return "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
}

/** Compact currency for tight spaces (KPI tiles on mobile): ₹16.5k, ₹1.2L */
export function inrCompact(n: number): string {
  const v = Math.round(Number(n) || 0);
  if (Math.abs(v) >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (Math.abs(v) >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  if (Math.abs(v) >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v}`;
}

/** "26 Jul 2026" — readable, unambiguous, locale-stable for an Indian shop. */
export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** "26 Jul" — for dense lists where the year is implied. */
export function fmtDateShort(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
