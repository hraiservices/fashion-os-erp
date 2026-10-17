import { describe, expect, it, vi, afterEach } from "vitest";
import { nextDueSort, sortOrdersByDue } from "@/lib/order-sort";

vi.mock("@/lib/ist-date", () => ({ istDateString: () => "2026-10-17" }));

const o = (id: string, deliveryDate: string) => ({ id, deliveryDate });

afterEach(() => vi.restoreAllMocks());

describe("nextDueSort", () => {
  it("cycles default → asc → desc → default", () => {
    expect(nextDueSort("none")).toBe("asc");
    expect(nextDueSort("asc")).toBe("desc");
    expect(nextDueSort("desc")).toBe("none");
  });
});

describe("sortOrdersByDue", () => {
  const list = [o("far", "2026-10-30"), o("late", "2026-10-10"), o("none", ""), o("today", "2026-10-17"), o("soon", "2026-10-19")];

  it("returns the same list for none", () => {
    expect(sortOrdersByDue(list, "none")).toBe(list);
  });

  it("sorts soonest (most overdue) first, undated last", () => {
    expect(sortOrdersByDue(list, "asc").map((x) => x.id)).toEqual(["late", "today", "soon", "far", "none"]);
  });

  it("sorts furthest first, undated still last", () => {
    expect(sortOrdersByDue(list, "desc").map((x) => x.id)).toEqual(["far", "soon", "today", "late", "none"]);
  });

  it("keeps incoming order for equal dates and does not mutate", () => {
    const tie = [o("a", "2026-10-20"), o("b", "2026-10-20")];
    expect(sortOrdersByDue(tie, "asc").map((x) => x.id)).toEqual(["a", "b"]);
    expect(sortOrdersByDue(tie, "desc").map((x) => x.id)).toEqual(["a", "b"]);
    expect(list.map((x) => x.id)).toEqual(["far", "late", "none", "today", "soon"]);
  });
});
