import { describe, it, expect } from "vitest";
import { buildStockMap, stockKey, isLowStock, estimateReorder, type LedgerRow } from "@/lib/inventory";

describe("buildStockMap", () => {
  it("keys stock by item_type:item_id so a raw_material and a product with the same id never collide", () => {
    const rows: LedgerRow[] = [
      { item_type: "raw_material", item_id: "abc", stock_qty: 10 },
      { item_type: "product", item_id: "abc", stock_qty: -5 },
    ];
    const map = buildStockMap(rows);
    expect(map.get(stockKey("raw_material", "abc"))).toBe(10);
    expect(map.get(stockKey("product", "abc"))).toBe(-5);
  });

  it("surfaces a negative balance rather than clamping it, since a negative ledger sum is a real data error to catch, not to hide", () => {
    const rows: LedgerRow[] = [{ item_type: "product", item_id: "x", stock_qty: -3 }];
    const map = buildStockMap(rows);
    expect(map.get(stockKey("product", "x"))).toBe(-3);
  });

  it("returns undefined (not zero) for an item with no ledger rows at all", () => {
    const map = buildStockMap([]);
    expect(map.get(stockKey("product", "missing"))).toBeUndefined();
  });
});

describe("isLowStock", () => {
  it("is never low-stock when the alert threshold is zero/unset, regardless of stock level", () => {
    expect(isLowStock(0, 0)).toBe(false);
    expect(isLowStock(-5, 0)).toBe(false);
  });

  it("flags low stock once quantity drops to or below the threshold", () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
    expect(isLowStock(0, 5)).toBe(true);
  });
});

describe("estimateReorder", () => {
  it("gives no estimate when nothing was consumed in the lookback window", () => {
    expect(estimateReorder(100, 0)).toEqual({ dailyRate: 0, daysUntilEmpty: null });
  });

  it("gives no estimate for a non-positive lookback window (avoids divide-by-zero)", () => {
    expect(estimateReorder(100, 30, 0)).toEqual({ dailyRate: 0, daysUntilEmpty: null });
    expect(estimateReorder(100, 30, -5)).toEqual({ dailyRate: 0, daysUntilEmpty: null });
  });

  it("projects days-until-empty from the average daily consumption rate", () => {
    const est = estimateReorder(100, 30, 30);
    expect(est.dailyRate).toBe(1);
    expect(est.daysUntilEmpty).toBe(100);
  });

  it("never returns a negative days-until-empty when current stock is already below the projected daily rate", () => {
    const est = estimateReorder(2, 300, 30);
    expect(est.dailyRate).toBe(10);
    expect(est.daysUntilEmpty).toBe(0);
  });
});
