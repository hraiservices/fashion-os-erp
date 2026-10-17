import { describe, expect, it, vi } from "vitest";
import { HEAT_RANK, daysQuiet, daysSince, leadHeat, neededInDays, neededLabel, needsAttention, nextStage, quietLevel, timeAgo, todayBuckets } from "@/lib/lead-insights";

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

describe("leadHeat", () => {
  const base = { stage: "talking", updatedAt: "2026-10-16T05:00:00Z", likelyToClose: false, expectedValue: 5000, nextFollowUp: null as { dueDate: string | null } | null };
  it("has no heat once decided", () => {
    expect(leadHeat({ ...base, stage: "won" }, TODAY)).toBeNull();
    expect(leadHeat({ ...base, stage: "lost" }, TODAY)).toBeNull();
  });
  it("treats the star as a manual hot override", () => {
    expect(leadHeat({ ...base, stage: "new", updatedAt: "2026-01-01T00:00:00Z", likelyToClose: true }, TODAY)).toBe("hot");
  });
  it("is hot for a fresh quoted lead with a follow-up lined up", () => {
    expect(leadHeat({ ...base, stage: "quoted", nextFollowUp: { dueDate: "2026-10-20" } }, TODAY)).toBe("hot");
  });
  it("is warm for a recent mid-stage lead and cold once it has gone quiet", () => {
    expect(leadHeat({ ...base, stage: "visit" }, TODAY)).toBe("warm");
    expect(leadHeat({ ...base, stage: "talking", updatedAt: "2026-10-01T00:00:00Z" }, TODAY)).toBe("cold");
  });
  it("counts a big sale and penalises an overdue follow-up", () => {
    expect(leadHeat({ ...base, stage: "talking", expectedValue: 50_000 }, TODAY)).toBe("warm");
    // an overdue follow-up drags a fresh mid-stage lead down a notch (1 + 2 - 1), while a lined-up one lifts it
    expect(leadHeat({ ...base, stage: "talking", nextFollowUp: { dueDate: "2026-10-10" } }, TODAY)).toBe("cold");
    expect(leadHeat({ ...base, stage: "talking", nextFollowUp: { dueDate: "2026-10-20" } }, TODAY)).toBe("warm");
    expect(leadHeat({ ...base, stage: "new", updatedAt: "2026-10-12T05:00:00Z", nextFollowUp: { dueDate: "2026-10-10" } }, TODAY)).toBe("cold");
  });
  it("lifts a lead whose outfit is needed soon", () => {
    // quoted (3) + fresh (2) = 5; a date within a week adds 2 and tips it to hot
    expect(leadHeat({ ...base, stage: "quoted", neededBy: "2026-10-22" }, TODAY)).toBe("hot");
    // new (0) + fresh (2) = 2 is cold; the same lead needed in 5 days (+2) is warm
    expect(leadHeat({ ...base, stage: "new" }, TODAY)).toBe("cold");
    expect(leadHeat({ ...base, stage: "new", neededBy: "2026-10-22" }, TODAY)).toBe("warm");
    // a date that has already passed adds nothing
    expect(leadHeat({ ...base, stage: "new", neededBy: "2026-09-01" }, TODAY)).toBe("cold");
  });
  it("ranks hot before warm before cold", () => {
    expect(HEAT_RANK.hot).toBeLessThan(HEAT_RANK.warm);
    expect(HEAT_RANK.warm).toBeLessThan(HEAT_RANK.cold);
  });
});

describe("todayBuckets", () => {
  const mk = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id, stage: "talking", updatedAt: "2026-10-16T05:00:00Z", likelyToClose: false, expectedValue: 1000, nextFollowUp: null as { dueDate: string | null } | null, ...over });
  it("puts each open lead in the first group it fits and ignores closed ones", () => {
    const leads = [
      mk("due-today", { nextFollowUp: { dueDate: "2026-10-17" } }),
      mk("overdue", { nextFollowUp: { dueDate: "2026-10-12" }, updatedAt: "2026-10-01T05:00:00Z" }),
      mk("future", { nextFollowUp: { dueDate: "2026-10-25" } }),
      mk("quiet-long", { updatedAt: "2026-10-01T05:00:00Z" }),
      mk("quiet-short", { updatedAt: "2026-10-13T05:00:00Z" }),
      mk("starred", { likelyToClose: true, expectedValue: 9000 }),
      mk("won", { stage: "won", likelyToClose: true }),
    ];
    const b = todayBuckets(leads, TODAY);
    expect(b.due.map((l) => l.id)).toEqual(["overdue", "due-today"]);
    expect(b.quiet.map((l) => l.id)).toEqual(["quiet-long", "quiet-short"]);
    expect(b.hot.map((l) => l.id)).toEqual(["starred"]);
  });
  it("is empty when nothing needs contact", () => {
    expect(todayBuckets([mk("fresh")], TODAY)).toEqual({ due: [], quiet: [], hot: [] });
  });
});

describe("neededInDays / neededLabel", () => {
  it("counts days to the date", () => {
    expect(neededInDays("2026-10-27", TODAY)).toBe(10);
    expect(neededInDays("2026-10-10", TODAY)).toBe(-7);
    expect(neededInDays(null, TODAY)).toBeNull();
  });
  it("words it and flags the urgent ones", () => {
    expect(neededLabel("2026-10-17", TODAY)).toEqual({ text: "Needed today", urgent: true });
    expect(neededLabel("2026-10-18", TODAY)).toEqual({ text: "Needed in 1 day", urgent: true });
    expect(neededLabel("2026-10-30", TODAY)).toEqual({ text: "Needed in 13 days", urgent: false });
    expect(neededLabel("2026-10-16", TODAY)).toEqual({ text: "Needed 1 day ago", urgent: true });
    expect(neededLabel(undefined, TODAY)).toBeNull();
  });
});
