/**
 * Dates customers shop for. Approximate — moveable festivals shift each year, so edit this list when a new year's
 * dates are announced. Powers the "reconnect with past customers" nudge on the Today tab.
 */
export interface Festival {
  name: string;
  date: string;
}

export const FESTIVALS: Festival[] = [
  { name: "Navratri", date: "2026-10-11" },
  { name: "Dussehra", date: "2026-10-20" },
  { name: "Karwa Chauth", date: "2026-10-29" },
  { name: "Diwali", date: "2026-11-08" },
  { name: "Wedding season", date: "2026-11-21" },
  { name: "Lohri", date: "2027-01-13" },
  { name: "Basant Panchami", date: "2027-02-11" },
  { name: "Eid", date: "2027-03-10" },
  { name: "Holi", date: "2027-03-22" },
  { name: "Raksha Bandhan", date: "2027-08-17" },
];

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The next festival inside the window (default 45 days — long enough to stitch an outfit for it). */
export function upcomingFestival(today: string, windowDays = 45, list: Festival[] = FESTIVALS): (Festival & { daysAway: number }) | null {
  const next = list.map((f) => ({ ...f, daysAway: dayDiff(today, f.date) })).filter((f) => f.daysAway >= 0 && f.daysAway <= windowDays).sort((a, b) => a.daysAway - b.daysAway)[0];
  return next ?? null;
}

/** Used when AI is off or fails: a plain message with {name} to fill in. */
export function fallbackNudge(festival: string): string {
  return `Hi {name}! ${festival} is coming up 🎉 Would you like a new outfit stitched in time? Send us your design and we'll plan the delivery date for you.`;
}
