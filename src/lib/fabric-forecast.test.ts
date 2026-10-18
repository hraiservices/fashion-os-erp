import { describe, expect, it } from "vitest";
import { forecastMaterials } from "./fabric-forecast";

const mat = (id: string, stock: number, over = {}) => ({ id, name: id, unit: "m", stock, costPerUnit: 100, lowStockAlert: 0, ...over });

describe("forecastMaterials", () => {
  it("suggests last year's seasonal use minus stock", () => {
    const rows = forecastMaterials([mat("silk", 20), mat("lace", 500)], [
      { itemId: "silk", movement: -60, refType: "work_order_consume", createdAt: "2025-11-01T10:00:00Z" },
      { itemId: "lace", movement: -30, refType: "work_order_consume", createdAt: "2025-11-02T10:00:00Z" },
    ], "2026-10-20");
    expect(rows.find((r) => r.id === "silk")).toMatchObject({ need: 60, suggested: 40, estCost: 4000 });
    expect(rows.find((r) => r.id === "lace")?.suggested).toBe(0);
  });
  it("uses recent pace when it is higher, and falls back to last year's purchases", () => {
    const rows = forecastMaterials([mat("a", 0), mat("b", 0)], [
      { itemId: "a", movement: -90, refType: "work_order_consume", createdAt: "2026-09-01T10:00:00Z" },
      { itemId: "b", movement: 25, refType: "purchase", createdAt: "2025-11-03T10:00:00Z" },
    ], "2026-10-20");
    expect(rows.find((r) => r.id === "a")?.need).toBe(45);
    expect(rows.find((r) => r.id === "b")?.need).toBe(25);
  });
  it("skips materials with no signal", () => {
    expect(forecastMaterials([mat("x", 5)], [], "2026-10-20")).toEqual([]);
  });
});
