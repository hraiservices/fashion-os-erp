/** When a lead usually writes back, learned from their own WhatsApp messages in the lead's history. Pure. */

export interface ReplyActivity {
  kind: string;
  body: string;
  createdAt: string;
}

/** Hour of day (0–23) in India Standard Time. */
export function istHour(timestamp: string): number | null {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 330 * 60_000).getUTCHours();
}

const hour12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 || h === 24 ? " am" : " pm"}`;

/** The two-hour window with the most of their messages, once there are enough to mean something. */
export function usualReplyWindow(activities: ReplyActivity[], minMessages = 3): { label: string; count: number } | null {
  const hours = activities
    .filter((a) => a.kind === "whatsapp" && /^customer:/i.test(a.body))
    .map((a) => istHour(a.createdAt))
    .filter((h): h is number => h !== null);
  if (hours.length < minMessages) return null;
  const perHour = Array.from({ length: 24 }, (_, h) => hours.filter((x) => x === h).length);
  let best = 0;
  let bestStart = 0;
  for (let start = 0; start < 24; start++) {
    const n = perHour[start] + perHour[(start + 1) % 24];
    // On a tie, start the window at the busier hour.
    if (n > best || (n === best && perHour[start] > perHour[bestStart])) {
      best = n;
      bestStart = start;
    }
  }
  // Need a clear pattern: at least half of their messages land in the window.
  if (best < Math.ceil(hours.length / 2)) return null;
  return { label: `${hour12(bestStart)}–${hour12((bestStart + 2) % 24)}`, count: best };
}
