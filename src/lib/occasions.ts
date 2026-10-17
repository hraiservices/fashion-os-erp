/** Customers whose birthday or anniversary falls in the next few days. Dates are stored as YYYY-MM-DD; only month and day matter. */

export interface OccasionCustomer {
  name: string;
  mobile: string;
  dob: string | null;
  anniversary: string | null;
}

export interface Occasion {
  name: string;
  mobile: string;
  kind: "birthday" | "anniversary";
  daysAway: number;
  /** Month-day as "12 Nov" for display. */
  label: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysUntil(today: string, monthDay: string): number | null {
  const [y] = today.split("-").map(Number);
  const [, m, d] = monthDay.split("-").map(Number);
  if (!m || !d) return null;
  const from = Date.UTC(y, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  for (const year of [y, y + 1]) {
    // 29 Feb falls on 1 Mar in a non-leap year — close enough for a greeting reminder.
    const at = Date.UTC(year, m - 1, d);
    if (at >= from) return Math.round((at - from) / 86_400_000);
  }
  return null;
}

export function upcomingOccasions(customers: OccasionCustomer[], today: string, withinDays = 7): Occasion[] {
  const out: Occasion[] = [];
  for (const c of customers) {
    for (const [kind, value] of [["birthday", c.dob], ["anniversary", c.anniversary]] as const) {
      if (!value) continue;
      const daysAway = daysUntil(today, value.slice(0, 10));
      if (daysAway == null || daysAway > withinDays) continue;
      out.push({ name: c.name, mobile: c.mobile, kind, daysAway, label: `${Number(value.slice(8, 10))} ${MONTHS[Number(value.slice(5, 7)) - 1]}` });
    }
  }
  return out.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));
}
