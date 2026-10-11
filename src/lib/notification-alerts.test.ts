import { describe, expect, it } from "vitest";
import { categoryOf, DEFAULT_ALERT_PREFS, inQuietHours, isCritical, notificationUrl, parseAlertPrefs, visibleToRole } from "./notification-alerts";

describe("categories and importance", () => {
  it("groups every known type", () => {
    expect(["stage_change", "attendance", "leave_request", "payment_received", "day_book_summary", "ai_briefing", "something_new"].map(categoryOf)).toEqual(["orders", "people", "people", "money", "money", "briefing", "orders"]);
  });
  it("is critical only when someone has to act", () => {
    expect(isCritical({ type: "leave_request" })).toBe(true);
    expect(isCritical({ type: "payment_received" })).toBe(true);
    expect(isCritical({ type: "day_book_summary", message: "⚠️ Day not closed yet — count the drawer" })).toBe(true);
    expect(isCritical({ type: "day_book_summary", message: "Today: ₹12,000 in" })).toBe(false);
    expect(["stage_change", "attendance", "ai_briefing"].some((type) => isCritical({ type }))).toBe(false);
  });
  it("shows only stage changes to staff", () => {
    expect(visibleToRole("stage_change", "tailor")).toBe(true);
    expect(visibleToRole("payment_received", "sales")).toBe(false);
    expect(visibleToRole("leave_request", "manager")).toBe(true);
    expect(visibleToRole("leave_request", undefined)).toBe(false);
  });
  it("knows where to go", () => {
    expect(notificationUrl({ type: "day_book_summary" })).toBe("/reports/day-book");
    expect(notificationUrl({ type: "payment_received", order_id: "O1" })).toBe("/orders/O1");
    expect(notificationUrl({ type: "leave_request", employee_id: "e1" })).toBe("/employees/e1");
    expect(notificationUrl({ type: "x" })).toBeNull();
  });
});

describe("preferences", () => {
  it("falls back to defaults for junk", () => {
    expect(parseAlertPrefs(null)).toEqual(DEFAULT_ALERT_PREFS);
    expect(parseAlertPrefs("not json")).toEqual(DEFAULT_ALERT_PREFS);
    expect(parseAlertPrefs('{"sound":"yes","quietFrom":"25:00"}')).toEqual(DEFAULT_ALERT_PREFS);
  });
  it("keeps valid choices", () => {
    expect(parseAlertPrefs('{"sound":false,"quietHours":true,"quietFrom":"23:30"}')).toMatchObject({ sound: false, quietHours: true, quietFrom: "23:30", quietTo: "07:00" });
  });
  it("handles a quiet window that wraps past midnight", () => {
    const p = { ...DEFAULT_ALERT_PREFS, quietHours: true };
    expect(inQuietHours(p, 23 * 60)).toBe(true);
    expect(inQuietHours(p, 3 * 60)).toBe(true);
    expect(inQuietHours(p, 7 * 60)).toBe(false);
    expect(inQuietHours(p, 12 * 60)).toBe(false);
    expect(inQuietHours({ ...p, quietHours: false }, 23 * 60)).toBe(false);
    expect(inQuietHours({ ...p, quietFrom: "13:00", quietTo: "14:00" }, 13 * 60 + 30)).toBe(true);
  });
});
