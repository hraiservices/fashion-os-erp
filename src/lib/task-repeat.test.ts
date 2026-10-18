import { describe, expect, it } from "vitest";
import { catchUpDueDate, formatRepeatRule, nextDueDate, parseRepeatRule, presetOfRule, ruleForPreset } from "@/lib/task-repeat";

describe("parseRepeatRule", () => {
  it("reads every shape", () => {
    expect(parseRepeatRule("daily")).toEqual({ kind: "daily" });
    expect(parseRepeatRule("weekly:1,3,5")).toEqual({ kind: "weekly", weekdays: [1, 3, 5] });
    expect(parseRepeatRule("monthly:5")).toEqual({ kind: "monthly", day: 5 });
    expect(parseRepeatRule("days:14")).toEqual({ kind: "days", n: 14 });
  });
  it("tidies up what it is given", () => {
    expect(parseRepeatRule("weekly:3,3,1,9")).toEqual({ kind: "weekly", weekdays: [1, 3] });
    expect(parseRepeatRule("")).toBeNull();
    expect(parseRepeatRule("weekly:")).toBeNull();
    expect(parseRepeatRule("monthly:40")).toBeNull();
    expect(parseRepeatRule("nonsense")).toBeNull();
  });
});

describe("nextDueDate", () => {
  it("counts days forward", () => {
    expect(nextDueDate("daily", "2026-10-18")).toBe("2026-10-19");
    expect(nextDueDate("days:14", "2026-10-18")).toBe("2026-11-01");
  });
  it("finds the next chosen weekday", () => {
    // 2026-10-18 is a Sunday.
    expect(nextDueDate("weekly:1", "2026-10-18")).toBe("2026-10-19");
    expect(nextDueDate("weekly:1,4", "2026-10-19")).toBe("2026-10-22");
    expect(nextDueDate("weekly:0", "2026-10-18")).toBe("2026-10-25");
  });
  it("keeps a monthly date inside the month", () => {
    expect(nextDueDate("monthly:5", "2026-10-05")).toBe("2026-11-05");
    expect(nextDueDate("monthly:5", "2026-10-01")).toBe("2026-10-05");
    // 31st in a short month lands on the last day, never spills into the next one.
    expect(nextDueDate("monthly:31", "2026-01-31")).toBe("2026-02-28");
    expect(nextDueDate("monthly:15", "2026-12-20")).toBe("2027-01-15");
  });
  it("is null without a usable rule or date", () => {
    expect(nextDueDate("", "2026-10-18")).toBeNull();
    expect(nextDueDate("daily", "not-a-date")).toBeNull();
  });
});

describe("catchUpDueDate", () => {
  it("skips the missed ones and returns the next date ahead", () => {
    expect(catchUpDueDate("weekly:1", "2026-09-07", "2026-10-18")).toBe("2026-10-19");
    expect(catchUpDueDate("daily", "2026-10-01", "2026-10-18")).toBe("2026-10-18");
  });
  it("returns the normal next date when nothing was missed", () => {
    expect(catchUpDueDate("monthly:5", "2026-10-05", "2026-10-18")).toBe("2026-11-05");
  });
});

describe("formatRepeatRule", () => {
  it("says it in plain words", () => {
    expect(formatRepeatRule("daily")).toBe("Every day");
    expect(formatRepeatRule("weekly:1,5")).toBe("Every Monday, Friday");
    expect(formatRepeatRule("monthly:3")).toBe("Every month on the 3rd");
    expect(formatRepeatRule("days:10")).toBe("Every 10 days");
    expect(formatRepeatRule("")).toBe("");
  });
});

describe("form presets", () => {
  it("builds the rule from the due date", () => {
    // 2026-10-19 is a Monday.
    expect(ruleForPreset("weekly", "2026-10-19")).toBe("weekly:1");
    expect(ruleForPreset("monthly", "2026-10-05")).toBe("monthly:5");
    expect(ruleForPreset("daily", null)).toBe("daily");
    expect(ruleForPreset("fortnightly", null)).toBe("days:14");
  });
  it("needs a due date for weekly and monthly", () => {
    expect(ruleForPreset("weekly", null)).toBe("");
    expect(ruleForPreset("monthly", "")).toBe("");
    expect(ruleForPreset("", "2026-10-19")).toBe("");
  });
  it("reads a stored rule back to its choice", () => {
    expect(presetOfRule("weekly:1")).toBe("weekly");
    expect(presetOfRule("days:14")).toBe("fortnightly");
    expect(presetOfRule("monthly:5")).toBe("monthly");
    expect(presetOfRule("")).toBe("");
  });
});
