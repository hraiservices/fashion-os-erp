import { describe, expect, it } from "vitest";
import { buildCollections, collectionMessage, toneFor } from "./collections";

const order = (over = {}) => ({ id: "A1", name: "Asha Rao", mobile: "9876543210", status: "delivered", balance: 1000, deliveryDate: "2026-10-01", ...over });

describe("buildCollections", () => {
  it("combines orders and overdue invoices per customer and ranks by amount and lateness", () => {
    const rows = buildCollections(
      [order(), order({ id: "A2", balance: 500, deliveryDate: "2026-09-01" }), order({ id: "B1", mobile: "9000000000", name: "Meera", balance: 800, deliveryDate: "2026-10-08" }), order({ id: "C1", status: "stitching", mobile: "9111111111", balance: 9000 })],
      [{ invoiceNumber: "INV-1", customerName: "Meera", customerMobile: "9000000000", balance: 300, dueDate: "2026-09-20", invoiceDate: "2026-09-10", docStatus: "issued" }],
      "2026-10-10"
    );
    expect(rows.map((r) => r.mobile)).toEqual(["9876543210", "9000000000"]);
    expect(rows[0]).toMatchObject({ amount: 1500, daysLate: 39 });
    expect(rows[1].refs).toEqual(["order B1", "invoice INV-1"]);
  });
  it("picks a tone from lateness and loyalty", () => {
    expect(toneFor(3, 5)).toBe("gentle");
    expect(toneFor(3, 1)).toBe("friendly");
    expect(toneFor(15, 1)).toBe("firm");
    expect(toneFor(15, 6)).toBe("friendly");
    expect(toneFor(45, 9)).toBe("firm");
  });
  it("writes a message with the amount", () => {
    expect(collectionMessage({ name: "Asha Rao", amount: 1500, refs: ["order A1"], tone: "friendly" }, "Rose", "₹1,500")).toContain("₹1,500");
  });
});

describe("toneFor with several overdue items", () => {
  it("goes firm for a loyal customer with two things overdue past a week", () => {
    expect(toneFor(10, 5, 1)).toBe("friendly");
    expect(toneFor(10, 5, 2)).toBe("firm");
    expect(toneFor(3, 5, 2)).toBe("gentle");
  });
});
