/**
 * What counts as a notification, how important it is, and who gets the pop-up. Pure (no browser APIs) so the rules
 * are testable; the pop-up, sound and vibration themselves live in notification-announce.ts.
 *
 * Categories group the bell: Orders, Money, People (HR), Briefing. A notification is CRITICAL when someone has to act
 * on it — those get a pop-up, a sound and a vibration; everything else is a quiet badge in the bell.
 */

export type NotificationCategory = "orders" | "money" | "people" | "briefing";

export interface NotificationLike {
  type: string;
  message?: string | null;
}

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  orders: "Orders",
  money: "Money",
  people: "Employees",
  briefing: "Today's briefing",
};

export function categoryOf(type: string): NotificationCategory {
  switch (type) {
    case "leave_request":
    case "attendance":
      return "people";
    case "payment_received":
    case "day_book_summary":
      return "money";
    case "ai_briefing":
      return "briefing";
    default:
      return "orders"; // stage_change and anything new
  }
}

/** Needs someone to act now: a leave request to answer, money that just came in, a day left open. */
export function isCritical(n: NotificationLike): boolean {
  if (n.type === "leave_request" || n.type === "payment_received") return true;
  if (n.type === "day_book_summary") return /day not closed/i.test(n.message || "");
  return false;
}

/** Stage changes are for everyone who works orders; every other type is for admin and manager only. */
export function visibleToRole(type: string, role: string | null | undefined): boolean {
  return type === "stage_change" || role === "admin" || role === "manager";
}

/** Where tapping the notification goes. */
export function notificationUrl(n: { type: string; order_id?: string | null; employee_id?: string | null }): string | null {
  if (n.type === "day_book_summary") return "/reports/day-book";
  if (n.type === "payment_received" && !n.order_id) return "/sales/invoices";
  if (n.order_id) return `/orders/${n.order_id}`;
  if (n.employee_id) return `/employees/${n.employee_id}`;
  return null;
}

export function alertTitle(n: NotificationLike): string {
  switch (n.type) {
    case "leave_request":
      return "Leave request";
    case "payment_received":
      return "Payment received";
    case "day_book_summary":
      return "Day not closed";
    default:
      return "Notification";
  }
}

// ── Per-device preferences ────────────────────────────────────────────────

export interface AlertPrefs {
  popups: boolean;
  sound: boolean;
  vibration: boolean;
  quietHours: boolean;
  /** "HH:MM", shop-local. Sound and vibration are held back between these; the pop-up still shows. */
  quietFrom: string;
  quietTo: string;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = { popups: true, sound: true, vibration: true, quietHours: false, quietFrom: "22:00", quietTo: "07:00" };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseAlertPrefs(raw: string | null | undefined): AlertPrefs {
  try {
    const v = JSON.parse(raw || "{}") as Partial<AlertPrefs>;
    const bool = (x: unknown, d: boolean) => (typeof x === "boolean" ? x : d);
    return {
      popups: bool(v.popups, DEFAULT_ALERT_PREFS.popups),
      sound: bool(v.sound, DEFAULT_ALERT_PREFS.sound),
      vibration: bool(v.vibration, DEFAULT_ALERT_PREFS.vibration),
      quietHours: bool(v.quietHours, DEFAULT_ALERT_PREFS.quietHours),
      quietFrom: typeof v.quietFrom === "string" && HHMM.test(v.quietFrom) ? v.quietFrom : DEFAULT_ALERT_PREFS.quietFrom,
      quietTo: typeof v.quietTo === "string" && HHMM.test(v.quietTo) ? v.quietTo : DEFAULT_ALERT_PREFS.quietTo,
    };
  } catch {
    return DEFAULT_ALERT_PREFS;
  }
}

/** True when `minutes` (since midnight, shop-local) falls inside the quiet window — which may wrap past midnight. */
export function inQuietHours(prefs: AlertPrefs, minutes: number): boolean {
  if (!prefs.quietHours) return false;
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const from = m(prefs.quietFrom);
  const to = m(prefs.quietTo);
  if (from === to) return false;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}
