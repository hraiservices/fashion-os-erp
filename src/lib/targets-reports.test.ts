import { describe, it, expect } from "vitest";
import { buildTaskLoad, overdueAgeBuckets, rangesOverlap } from "./targets-reports";

const today = "2026-09-20";
const range = { from: "2026-09-01", to: "2026-09-30" };

describe("buildTaskLoad", () => {
  it("counts open, due today, overdue and finished per person, most overdue first", () => {
    const rows = buildTaskLoad(
      [
        { assigneeId: "asha", status: "todo", dueDate: "2026-09-10", completedDate: null },
        { assigneeId: "asha", status: "in_progress", dueDate: today, completedDate: null },
        { assigneeId: "asha", status: "done", dueDate: "2026-09-05", completedDate: "2026-09-06" },
        { assigneeId: "asha", status: "done", dueDate: "2026-08-05", completedDate: "2026-08-06" },
        { assigneeId: "ravi", status: "todo", dueDate: "2026-09-25", completedDate: null },
        { assigneeId: null, status: "todo", dueDate: null, completedDate: null },
        { assigneeId: "ravi", status: "cancelled", dueDate: "2026-09-01", completedDate: null },
      ],
      today,
      range
    );
    const asha = rows.find((r) => r.assigneeId === "asha")!;
    expect(asha).toMatchObject({ open: 2, dueToday: 1, overdue: 1, doneInRange: 1, oldestOverdueDays: 10 });
    expect(rows[0].assigneeId).toBe("asha");
    expect(rows.find((r) => r.assigneeId === "ravi")).toMatchObject({ open: 1, overdue: 0, oldestOverdueDays: null });
    expect(rows.find((r) => r.assigneeId === null)).toMatchObject({ open: 1 });
  });
});

describe("overdueAgeBuckets", () => {
  it("buckets how late open tasks are", () => {
    const b = overdueAgeBuckets(
      [
        { status: "todo", dueDate: "2026-09-19" },
        { status: "todo", dueDate: "2026-09-17" },
        { status: "todo", dueDate: "2026-09-14" },
        { status: "todo", dueDate: "2026-09-08" },
        { status: "todo", dueDate: "2026-08-01" },
        { status: "done", dueDate: "2026-08-01" },
        { status: "todo", dueDate: today },
      ],
      today
    );
    expect(b.map((x) => x.count)).toEqual([2, 1, 1, 1]);
  });
});

describe("rangesOverlap", () => {
  it("includes touching and contained ranges, excludes disjoint ones", () => {
    const sept = { start: "2026-09-01", end: "2026-09-30" };
    expect(rangesOverlap(sept, { start: "2026-09-30", end: "2026-10-15" })).toBe(true);
    expect(rangesOverlap(sept, { start: "2026-09-10", end: "2026-09-12" })).toBe(true);
    expect(rangesOverlap(sept, { start: "2026-10-01", end: "2026-10-31" })).toBe(false);
    expect(rangesOverlap(sept, { start: "2026-08-01", end: "2026-08-31" })).toBe(false);
  });
});
