import { describe, it, expect } from "vitest";
import { isPlannerReminderDue } from "./planner";

const today = "2026-09-10";

describe("isPlannerReminderDue", () => {
  it("is false with no reminder set", () => {
    expect(isPlannerReminderDue({ reminderAt: null, reminderSentFor: null }, today)).toBe(false);
  });

  it("is true when the reminder falls on today (IST) and hasn't been sent yet", () => {
    expect(isPlannerReminderDue({ reminderAt: "2026-09-10T09:00:00.000Z", reminderSentFor: null }, today)).toBe(true);
  });

  it("is false once already sent for today", () => {
    expect(isPlannerReminderDue({ reminderAt: "2026-09-10T09:00:00.000Z", reminderSentFor: "2026-09-10" }, today)).toBe(false);
  });

  it("is false for a reminder on a different day", () => {
    expect(isPlannerReminderDue({ reminderAt: "2026-09-09T09:00:00.000Z", reminderSentFor: null }, today)).toBe(false);
    expect(isPlannerReminderDue({ reminderAt: "2026-09-11T09:00:00.000Z", reminderSentFor: null }, today)).toBe(false);
  });

  it("reads the reminder's IST calendar date, not its UTC one", () => {
    // 2026-09-10 23:00 IST is already 2026-09-10 17:30 UTC the same day, so this isn't the
    // interesting case — the real one is a late-night IST time that's still the PREVIOUS UTC day.
    // 2026-09-10 02:00 IST = 2026-09-09 20:30 UTC: a naive UTC-date slice would read "09-09", not "09-10".
    expect(isPlannerReminderDue({ reminderAt: "2026-09-09T20:30:00.000Z", reminderSentFor: null }, today)).toBe(true);
  });
});
