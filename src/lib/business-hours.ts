import { istDateString } from "@/lib/ist-date";

/** Shop's open/close window (24h "HH:MM", IST) and closed weekdays (0=Sunday..6=Saturday). India
 *  has no DST, so a fixed IST offset (see ist-date.ts) is always correct — no timezone-database
 *  lookup needed. Configured in Settings → Company information; see use-shop-settings.ts. */
export interface BusinessHours {
  openTime: string;
  closeTime: string;
  closedWeekdays: number[];
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  openTime: "10:30",
  closeTime: "20:00",
  closedWeekdays: [0],
};

function istWeekday(dateStr: string): number {
  // Midday avoids any edge case at the exact day boundary — India has no DST, so this is purely
  // for clarity, not correctness.
  return new Date(`${dateStr}T12:00:00+05:30`).getUTCDay();
}

function addIstDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + n);
  return istDateString(d);
}

/**
 * Minutes of overlap between [startIso, endIso) and the shop's open hours, across however many
 * calendar days the range spans, with closed weekdays contributing zero. Built for "how long did
 * this stage change really take" (Reports → Stage Change Speed and similar) — the raw wall-clock
 * gap between two timestamps overstates idle time whenever it crosses a closed evening/night or a
 * closed weekday, since nothing could have happened during hours the shop wasn't open anyway.
 *
 * Bounded to 400 days of iteration — a corrupted or absurdly large range should never hang the
 * request; real stage-change gaps are days, not years.
 */
export function businessMinutesBetween(startIso: string, endIso: string, hours: BusinessHours = DEFAULT_BUSINESS_HOURS): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!(end.getTime() > start.getTime())) return 0;

  let totalMs = 0;
  let dateStr = istDateString(start);
  const endDateStr = istDateString(end);

  for (let i = 0; i < 400 && dateStr <= endDateStr; i++, dateStr = addIstDays(dateStr, 1)) {
    if (hours.closedWeekdays.includes(istWeekday(dateStr))) continue;
    const dayOpen = new Date(`${dateStr}T${hours.openTime}:00+05:30`);
    const dayClose = new Date(`${dateStr}T${hours.closeTime}:00+05:30`);
    const overlapStart = start > dayOpen ? start : dayOpen;
    const overlapEnd = end < dayClose ? end : dayClose;
    if (overlapEnd > overlapStart) totalMs += overlapEnd.getTime() - overlapStart.getTime();
  }
  return Math.round(totalMs / 60_000);
}
