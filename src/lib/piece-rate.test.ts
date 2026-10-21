import { describe, it, expect } from "vitest";
import { getPieceRateAdvanceCap, pieceRateItemsFromOrders, pieceRateItemsFromWorkOrders } from "@/lib/piece-rate";

/**
 * Regression test for a real, live bug: getPieceRateAdvanceCap always computed ₹0 for every
 * piece-rate tailor's advance cap, no matter how much they were actually owed. Traced to a live
 * case — an employee with a genuinely unpaid ₹300 garment and zero advances drawn against it
 * still showed a ₹0 cap.
 *
 * Root cause: `.contains("garments", [{ tailor: employeeId }])` — supabase-js's .contains()
 * branches on typeof value, and an ARRAY value (which this is) hits the native-Postgres-array
 * serialization path (`cs.{${value.join(',')}}`), not JSON. Joining an array containing one
 * object stringifies it to the literal text "[object Object]", producing a filter PostgREST
 * rejects on a jsonb column — an error the function never checked, so it was silently treated
 * as "this employee has zero confirmed orders."
 *
 * This test builds a fake query chain that actually enforces the same distinction PostgREST
 * would: a `.filter("garments", "cs", <value>)` call only "matches" (returns the seeded order)
 * when <value> is valid JSON whose parsed content matches the garment — exactly the case
 * .contains() with an array-of-objects value could never produce.
 */
function fakeSupabase(seededOrder: { garments: unknown } | null, employeeId: string) {
  function ordersChain() {
    const chain = {
      select: () => chain,
      not: () => chain,
      is: () => chain,
      filter: (column: string, op: string, value: string) => {
        if (column !== "garments" || op !== "cs") return { data: [], error: null };
        let parsed: unknown;
        try {
          parsed = JSON.parse(value);
        } catch {
          // What the old .contains() call actually produced: not valid JSON at all.
          return { data: null, error: { message: `invalid input syntax: "${value}"` } };
        }
        const wantsThisEmployee = Array.isArray(parsed) && parsed[0]?.tailor === employeeId;
        return { data: wantsThisEmployee && seededOrder ? [seededOrder] : [], error: null };
      },
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    };
    return chain;
  }

  function emptyChain() {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      not: () => chain,
      is: () => chain,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    };
    return chain;
  }

  return {
    from: (table: string) => {
      if (table === "orders") return ordersChain() as never;
      return emptyChain() as never;
    },
  };
}

describe("getPieceRateAdvanceCap", () => {
  const employeeId = "f868385c-3118-4227-9454-dfa4ea9a9aeb";

  it("counts an unpaid garment's payableAmount toward the cap (the live case this was reported against)", async () => {
    const seededOrder = { garments: [{ tailor: employeeId, payableAmount: 300 }] };
    const cap = await getPieceRateAdvanceCap(fakeSupabase(seededOrder, employeeId) as never, employeeId);
    expect(cap).toBe(300);
  });

  it("would have returned ₹0 under the old .contains()-style broken filter — this is the bug this test guards against", async () => {
    // Simulates exactly what .contains("garments", [{ tailor: employeeId }]) used to send:
    // a non-JSON value ("[object Object]" wrapped in the array-literal braces), which the fake
    // rejects the same way PostgREST would reject it against a jsonb column.
    const brokenChain = {
      select: () => brokenChain,
      not: () => brokenChain,
      is: () => brokenChain,
      filter: () => ({ data: null, error: { message: 'invalid input syntax for type json: "{[object Object]}"' } }),
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    };
    const broken = { from: (table: string) => (table === "orders" ? brokenChain : fakeSupabase(null, employeeId).from(table)) };
    await expect(getPieceRateAdvanceCap(broken as never, employeeId)).rejects.toThrow(/unpaid orders/i);
  });

  it("returns ₹0, not an error, when there's genuinely no unpaid order for this employee", async () => {
    const cap = await getPieceRateAdvanceCap(fakeSupabase(null, employeeId) as never, employeeId);
    expect(cap).toBe(0);
  });
});

describe("pieceRateItemsFromOrders", () => {
  const employeeId = "f868385c-3118-4227-9454-dfa4ea9a9aeb";

  it("one row per garment, not one row per order — so a payslip can show exactly what was paid for", () => {
    const items = pieceRateItemsFromOrders(employeeId, [
      {
        id: "o1",
        name: "Priya Sharma",
        inDate: "2026-09-20",
        readyAt: "2026-09-28",
        garments: [
          { type: "Blouse", lining: "s", payableAmount: 300, tailor: employeeId },
          { type: "Saree Fall", payableAmount: 100, tailor: employeeId },
          // Someone else's garment on the same order must not leak into this tailor's list.
          { type: "Blouse", payableAmount: 300, tailor: "someone-else" },
        ],
      },
    ]);
    expect(items).toEqual([
      { source: "order", id: "o1", label: "Priya Sharma — Blouse (s)", date: "2026-09-28", amount: 300 },
      { source: "order", id: "o1", label: "Priya Sharma — Saree Fall", date: "2026-09-28", amount: 100 },
    ]);
  });

  it("falls back to inDate when the order hasn't reached Ready (readyAt is null)", () => {
    const items = pieceRateItemsFromOrders(employeeId, [{ id: "o2", name: "Ravi Kumar", inDate: "2026-10-03", readyAt: null, garments: [{ type: "Kurta", payableAmount: 250, tailor: employeeId }] }]);
    expect(items[0].date).toBe("2026-10-03");
  });

  it("skips a garment with no payableAmount, same as the sum this itemizes", () => {
    const items = pieceRateItemsFromOrders(employeeId, [{ id: "o3", name: "Anita", inDate: "2026-10-01", readyAt: null, garments: [{ type: "Blouse", tailor: employeeId }] }]);
    expect(items).toEqual([]);
  });
});

describe("pieceRateItemsFromWorkOrders", () => {
  const employeeId = "f868385c-3118-4227-9454-dfa4ea9a9aeb";

  it("one row per work order assigned to this tailor with a real laborCost", () => {
    const items = pieceRateItemsFromWorkOrders(employeeId, [
      { id: "w1", woNumber: "WO-12", productName: "Cotton Kurti", completedAt: "2026-10-02", tailor: employeeId, laborCost: 450 },
      { id: "w2", woNumber: "WO-13", productName: "Linen Shirt", completedAt: "2026-10-05", tailor: "someone-else", laborCost: 400 },
      { id: "w3", woNumber: "WO-14", productName: "Silk Dupatta", completedAt: "2026-10-06", tailor: employeeId, laborCost: null },
    ]);
    expect(items).toEqual([{ source: "work_order", id: "w1", label: "WO-12 — Cotton Kurti", date: "2026-10-02", amount: 450 }]);
  });
});
