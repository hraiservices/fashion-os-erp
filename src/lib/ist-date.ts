/** Server routes run in UTC on Vercel, but attendance/payroll dates are always meant to be the
 *  shop's local (IST, UTC+5:30) calendar date — `new Date().toISOString().slice(0, 10)` rolls
 *  the date back for ~5.5 hours after IST midnight (00:00–05:30 IST is still the previous UTC
 *  day), corrupting the attendance date and, downstream, payroll. India has no DST, so a fixed
 *  +5:30 offset is always correct — no timezone-database lookup needed. */
export function istDateString(d: Date = new Date()): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
