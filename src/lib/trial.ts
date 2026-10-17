/** Fitting trials: a task on the day, with the time in its title and the customer's number in its description so the Today list can send reminders. */

export const TRIAL_TAG = "trial";

export const trialTitle = (name: string, orderId: string, time: string) => `Trial${time ? ` ${time}` : ""} — ${name} (${orderId})`;

export const trialDescription = (mobile: string, orderId: string) => `Fitting trial for order ${orderId}.\nMobile: ${mobile}`;

export function mobileFromTrial(description: string): string {
  const m = /Mobile:\s*(\d{10})/.exec(description);
  return m ? m[1] : "";
}

/** "17:30" → "5:30 PM". */
export function prettyTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

export function trialMessage(opts: { name: string; shop: string; dateLabel: string; time: string; reminder?: boolean }): string {
  const first = opts.name.trim().split(/\s+/)[0] || "there";
  const when = `${opts.dateLabel}${opts.time ? ` at ${opts.time}` : ""}`;
  return opts.reminder
    ? `Hi ${first}! A reminder from ${opts.shop || "us"}: your fitting trial is ${when}. Please let us know if you need to change the time. See you soon! 🙏`
    : `Hi ${first}! Your fitting trial at ${opts.shop || "our shop"} is booked for ${when}. Please come with the matching footwear and innerwear if you can. Reply here if you need to change the time. 🙏`;
}
