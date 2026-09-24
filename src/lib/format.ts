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

/** "2:45 pm" — a chat bubble's timestamp needs the time of day, not the full date; the date is
 *  already implied by scrolling context. */
export function fmtTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
}

/** "45 min" / "2h 15m" / "3d 4h" — a stage-change duration report needs minutes as the base unit
 *  (that's what actually distinguishes a fast handoff from a slow one), but a multi-day gap
 *  rendered as "4320 min" is unreadable, so this steps up the unit once the value crosses an
 *  hour/day threshold rather than ever showing more than two units at once. */
export function fmtMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const totalHours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (totalHours < 24) return remMinutes > 0 ? `${totalHours}h ${remMinutes}m` : `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}
