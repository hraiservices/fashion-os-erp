import { describe, it, expect } from "vitest";
import { getPieceRateAdvanceCap, isSelfConfirmedPayable } from "@/lib/piece-rate";
import type { Garment } from "@/lib/types";

/**
 * Regression test for a real, confirmed-live bug: getPieceRateAdvanceCap always computed ₹0
 * for every piece-rate tailor's advance cap, no matter how much they'd actually confirmed and
 * were owed. Traced to a live case — an employee with a genuinely confirmed, unpaid ₹300
 * garment and zero advances drawn against it still showed a ₹0 cap.
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

  it("counts a confirmed garment's payableAmount toward the cap (the live case this was reported against)", async () => {
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
    await expect(getPieceRateAdvanceCap(broken as never, employeeId)).rejects.toThrow(/confirmed orders/i);
  });

  it("returns ₹0, not an error, when there's genuinely no confirmed order for this employee", async () => {
    const cap = await getPieceRateAdvanceCap(fakeSupabase(null, employeeId) as never, employeeId);
    expect(cap).toBe(0);
  });
});

describe("isSelfConfirmedPayable", () => {
  const tailorId = "f868385c-3118-4227-9454-dfa4ea9a9aeb";
  const garment = (overrides: Partial<Garment> = {}): Garment => ({ type: "Simple Suit", ...overrides });

  it("is false when nobody's logged in as a linked employee (most admin/manager accounts)", () => {
    expect(isSelfConfirmedPayable(null, { tailor: tailorId, garments: [garment({ tailor: tailorId })] })).toBe(false);
    expect(isSelfConfirmedPayable(undefined, { tailor: tailorId, garments: [] })).toBe(false);
  });

  it("is true when the actor is the order-level tailor", () => {
    expect(isSelfConfirmedPayable(tailorId, { tailor: tailorId, garments: [] })).toBe(true);
  });

  it("is true when the actor matches a garment's own tailor, even if the order-level tailor differs", () => {
    expect(isSelfConfirmedPayable(tailorId, { tailor: "someone-else", garments: [garment({ tailor: tailorId })] })).toBe(true);
  });

  it("is false when the actor matches neither the order nor any garment", () => {
    expect(isSelfConfirmedPayable(tailorId, { tailor: "someone-else", garments: [garment({ tailor: "another-one" })] })).toBe(false);
  });
});
