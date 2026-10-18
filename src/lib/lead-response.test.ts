import { describe, expect, it } from "vitest";
import { formatMinutes, isUnowned, responseByOwner, responseMinutes, speedBucket, speedVsWinRate, UNOWNED_ALERT_MINUTES } from "@/lib/lead-response";

const NOW = Date.parse("2026-10-18T10:00:00Z");
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();
const lead = (over: Partial<Parameters<typeof isUnowned>[0]> = {}) => ({ stage: "new", assignedEmployeeId: null, createdAt: ago(60), ...over });

describe("isUnowned", () => {
  it("flags an open lead with no owner once it is old enough", () => {
    expect(isUnowned(lead({ createdAt: ago(UNOWNED_ALERT_MINUTES + 1) }), NOW)).toBe(true);
  });
  it("leaves a brand new lead alone", () => {
    expect(isUnowned(lead({ createdAt: ago(2) }), NOW)).toBe(false);
  });
  it("ignores leads that have an owner, or are already decided", () => {
    expect(isUnowned(lead({ assignedEmployeeId: "e1" }), NOW)).toBe(false);
    expect(isUnowned(lead({ stage: "won" }), NOW)).toBe(false);
    expect(isUnowned(lead({ stage: "lost" }), NOW)).toBe(false);
  });
});

describe("responseMinutes and formatMinutes", () => {
  it("measures from arrival to the first reply", () => {
    expect(responseMinutes({ ...lead(), createdAt: "2026-10-18T09:00:00Z", firstResponseAt: "2026-10-18T09:12:00Z" })).toBe(12);
  });
  it("is null when nobody replied", () => {
    expect(responseMinutes(lead())).toBeNull();
  });
  it("words durations shortly", () => {
    expect(formatMinutes(12)).toBe("12 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(200)).toBe("3 h 20 m");
    expect(formatMinutes(1440)).toBe("1 day");
    expect(formatMinutes(4320)).toBe("3 days");
  });
});

describe("speedBucket", () => {
  it("sorts into the right band", () => {
    expect(speedBucket(5)).toBe("under15");
    expect(speedBucket(30)).toBe("under1h");
    expect(speedBucket(120)).toBe("under4h");
    expect(speedBucket(600)).toBe("sameDay");
    expect(speedBucket(5000)).toBe("slow");
    expect(speedBucket(null)).toBe("noReply");
  });
});

describe("speedVsWinRate", () => {
  const decided = [
    { ...lead({ stage: "won" }), createdAt: "2026-10-01T09:00:00Z", firstResponseAt: "2026-10-01T09:05:00Z" },
    { ...lead({ stage: "won" }), createdAt: "2026-10-02T09:00:00Z", firstResponseAt: "2026-10-02T09:10:00Z" },
    { ...lead({ stage: "lost" }), createdAt: "2026-10-03T09:00:00Z", firstResponseAt: "2026-10-03T09:08:00Z" },
    { ...lead({ stage: "lost" }), createdAt: "2026-10-04T09:00:00Z", firstResponseAt: "2026-10-06T09:00:00Z" },
    { ...lead({ stage: "new" }), createdAt: "2026-10-05T09:00:00Z", firstResponseAt: "2026-10-05T09:01:00Z" },
  ];
  it("counts only decided leads and works out the win rate", () => {
    const rows = speedVsWinRate(decided);
    const fast = rows.find((r) => r.key === "under15");
    expect(fast).toMatchObject({ leads: 3, won: 2, winRatePct: 67 });
    expect(rows.find((r) => r.key === "slow")).toMatchObject({ leads: 1, won: 0, winRatePct: 0 });
  });
  it("drops bands nobody is in", () => {
    expect(speedVsWinRate(decided).some((r) => r.key === "under4h")).toBe(false);
  });
});

describe("responseByOwner", () => {
  it("gives each person their median and slowest reply", () => {
    const rows = responseByOwner([
      { ...lead({ assignedEmployeeId: "asha" }), createdAt: "2026-10-01T09:00:00Z", firstResponseAt: "2026-10-01T09:10:00Z" },
      { ...lead({ assignedEmployeeId: "asha" }), createdAt: "2026-10-02T09:00:00Z", firstResponseAt: "2026-10-02T09:30:00Z" },
      { ...lead({ assignedEmployeeId: "asha" }), createdAt: "2026-10-03T09:00:00Z", firstResponseAt: "2026-10-03T11:00:00Z" },
      { ...lead({ assignedEmployeeId: "ravi" }), createdAt: "2026-10-04T09:00:00Z", firstResponseAt: "2026-10-04T14:00:00Z" },
      { ...lead({ assignedEmployeeId: "ravi" }) },
    ]);
    expect(rows[0]).toMatchObject({ employeeId: "asha", replied: 3, noReply: 0, medianMinutes: 30, slowestMinutes: 120 });
    expect(rows[1]).toMatchObject({ employeeId: "ravi", replied: 1, noReply: 1, medianMinutes: 300 });
  });
  it("puts unowned leads under a null person", () => {
    expect(responseByOwner([lead()])[0].employeeId).toBeNull();
  });
});
