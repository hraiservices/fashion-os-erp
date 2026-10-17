import { describe, expect, it, vi } from "vitest";
import { addDays, daysQuiet, daysSince, needsAttention, nextStage, quietLevel, timeAgo } from "@/lib/lead-insights";

vi.mock("@/lib/ist-date", () => ({ istDateString: (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10) }));

const TODAY = "2026-10-17";

describe("daysSince", () => {
  it("counts shop-local days", () => {
    expect(daysSince("2026-10-17T03:00:00Z", TODAY)).toBe(0);
    expect(daysSince("2026-10-14T03:00:00Z", TODAY)).toBe(3);
    // 20:00 UTC on the 14th is already the 15th in India
    expect(daysSince("2026-10-14T20:00:00Z", TODAY)).toBe(2);
  });
  it("never goes negative or breaks on junk", () => {
    expect(daysSince("2026-12-01T00:00:00Z", TODAY)).toBe(0);
    expect(daysSince("not a date", TODAY)).toBe(0);
    expect(daysSince("", TODAY)).toBe(0);
  });
});

describe("quietLevel", () => {
  it("is amber from 3 days and red from 7", () => {
    expect(quietLevel(2)).toBe("none");
    expect(quietLevel(3)).toBe("amber");
    expect(quietLevel(6)).toBe("amber");
    expect(quietLevel(7)).toBe("red");
  });
});

describe("daysQuiet / needsAttention", () => {
  const open = { stage: "talking", updatedAt: "2026-10-10T05:00:00Z" };
  it("counts quiet days for open leads only", () => {
    expect(daysQuiet(open, TODAY)).toBe(7);
    expect(daysQuiet({ stage: "won", updatedAt: open.updatedAt }, TODAY)).toBe(0);
  });
  it("flags quiet leads and overdue follow-ups, not fresh ones or closed ones", () => {
    expect(needsAttention(open, TODAY)).toBe(true);
    expect(needsAttention({ stage: "new", updatedAt: "2026-10-17T01:00:00Z", nextFollowUp: { dueDate: "2026-10-16" } }, TODAY)).toBe(true);
    expect(needsAttention({ stage: "new", updatedAt: "2026-10-17T01:00:00Z", nextFollowUp: { dueDate: "2026-10-17" } }, TODAY)).toBe(false);
    expect(needsAttention({ stage: "new", updatedAt: "2026-10-17T01:00:00Z" }, TODAY)).toBe(false);
    expect(needsAttention({ stage: "lost", updatedAt: "2026-01-01T00:00:00Z" }, TODAY)).toBe(false);
  });
});

describe("nextStage", () => {
  it("steps along and stops at won", () => {
    expect(nextStage("new")).toBe("talking");
    expect(nextStage("talking")).toBe("visit");
    expect(nextStage("visit")).toBe("quoted");
    expect(nextStage("quoted")).toBe("won");
    expect(nextStage("won")).toBeNull();
    expect(nextStage("lost")).toBeNull();
    expect(nextStage("???")).toBeNull();
  });
});

describe("addDays", () => {
  it("adds calendar days across months", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  it("reads naturally at every scale", () => {
    expect(timeAgo("2026-10-17T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-10-17T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-10-17T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-15T12:00:00Z", now)).toBe("2d ago");
    expect(timeAgo("2026-09-26T12:00:00Z", now)).toBe("3w ago");
    expect(timeAgo("junk", now)).toBe("");
    expect(timeAgo("2026-10-18T12:00:00Z", now)).toBe("just now");
  });
});
