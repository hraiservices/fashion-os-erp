import { describe, it, expect } from "vitest";
import {
  buildAccountantSheets,
  buildAttendanceBoard,
  buildDiscountSummary,
  buildSoldToday,
  compactSummary,
  invoiceDiscount,
} from "./day-book-insights";
import { emptySplit } from "./day-book-extras";
import type { DayBookEntry } from "./day-book";

describe("invoiceDiscount", () => {
  it("counts line-level discounts (list price × qty − line amount)", () => {
    const r = invoiceDiscount({ items: [{ qty: 2, unitPrice: 500, amount: 900 }], discount_type: "flat", discount_value: 0 });
    expect(r).toEqual({ amount: 100, gross: 1000 });
  });
  it("adds a flat invoice-level discount", () => {
    const r = invoiceDiscount({ items: [{ qty: 1, unitPrice: 1000, amount: 1000 }], discount_type: "flat", discount_value: 150 });
    expect(r.amount).toBe(150);
  });
  it("applies a percent invoice-level discount to the post-line total", () => {
    const r = invoiceDiscount({ items: [{ qty: 1, unitPrice: 1000, amount: 800 }], discount_type: "percent", discount_value: 10 });
    expect(r.amount).toBe(280); // 200 line discount + 10% of 800
  });
  it("never goes negative on a malformed row", () => {
    expect(invoiceDiscount({ items: [{ qty: 1, unitPrice: 100, amount: 500 }], discount_type: "flat", discount_value: -50 }).amount).toBe(0);
    expect(invoiceDiscount({ items: null, discount_type: "flat", discount_value: 0 }).amount).toBe(0);
  });
});

describe("buildDiscountSummary", () => {
  const inv = (over: Record<string, unknown>) => ({
    id: "i",
    invoice_number: "INV-1",
    doc_status: "sent",
    created_by: "asha@shop.in",
    items: [{ qty: 1, unitPrice: 1000, amount: 1000 }],
    discount_type: "flat",
    discount_value: 0,
    ...over,
  });

  it("totals per user, skips drafts, and flags big discounts", () => {
    const s = buildDiscountSummary(
      [
        inv({ id: "a", invoice_number: "INV-A", discount_value: 100 }),
        inv({ id: "b", invoice_number: "INV-B", discount_value: 300 }), // 30% → flagged
        inv({ id: "c", invoice_number: "INV-C", discount_value: 900, doc_status: "draft" }),
      ] as Parameters<typeof buildDiscountSummary>[0],
      [{ pt_discount: 50 }, { pt_discount: null }]
    );
    expect(s.total).toBe(400);
    expect(s.byUser).toEqual([{ user: "asha", amount: 400, invoices: 2 }]);
    expect(s.flagged.map((f) => f.reference)).toEqual(["INV-B"]);
    expect(s.flagged[0].pct).toBe(30);
    expect(s.loyaltyRedeemed).toBe(50);
  });
});

describe("buildSoldToday", () => {
  it("groups garments and products and splits new vs repeat customers", () => {
    const sold = buildSoldToday(
      [
        { mobile: "111", garments: [{ type: "Blouse", no: 2 }, { type: "Pant Suit" }] },
        { mobile: "222", garments: [{ type: "Blouse", no: 1 }] },
        { mobile: "111", garments: [] },
      ],
      [
        { doc_status: "sent", items: [{ productName: "Dupatta", qty: 2, amount: 400 }] },
        { doc_status: "draft", items: [{ productName: "Dupatta", qty: 9, amount: 9999 }] },
      ],
      new Set(["222"])
    );
    expect(sold.garments[0]).toEqual({ name: "Blouse", qty: 3 });
    expect(sold.products).toEqual([{ name: "Dupatta", qty: 2, amount: 400 }]);
    expect(sold.newCustomers).toBe(1);
    expect(sold.repeatCustomers).toBe(1);
  });
});

describe("buildAttendanceBoard", () => {
  const emps = [
    { id: "1", name: "Asha", active: true },
    { id: "2", name: "Ravi", active: true },
    { id: "3", name: "Meena", active: true },
    { id: "4", name: "Old Staff", active: false },
  ];
  it("sorts staff into present / absent / leave / not marked", () => {
    const board = buildAttendanceBoard(
      emps,
      [
        { employee_id: "1", status: "present", check_in_at: "2026-09-01T04:00:00Z", check_out_at: null, hours_worked: null, overtime_hours: 0 },
        { employee_id: "2", status: "absent", check_in_at: null, check_out_at: null, hours_worked: null, overtime_hours: 0 },
      ],
      new Set(["3"])
    );
    expect(board.present.map((p) => p.name)).toEqual(["Asha"]);
    expect(board.absent).toEqual(["Ravi"]);
    expect(board.onLeave).toEqual(["Meena"]);
    expect(board.notMarked).toEqual([]);
  });
  it("lists active staff with no record as not marked, ignoring inactive ones", () => {
    const board = buildAttendanceBoard(emps, [], new Set());
    expect(board.notMarked).toEqual(["Asha", "Ravi", "Meena"]);
  });
});

describe("buildAccountantSheets", () => {
  const entry = (over: Partial<DayBookEntry>): DayBookEntry => ({ id: "x", time: "2026-09-01T05:00:00Z", module: "sales", activity: "Invoice Created", description: "d", user: "asha", ...over });
  const cash = { opening: 0, cashIn: 0, cashOut: 0, breakdown: { receipts: 0, adjustmentsIn: 0, expenses: 0, vendorPayments: 0, advances: 0, adjustmentsOut: 0 }, expected: 0, openingFromDate: null };

  it("makes a sheet per voucher type that has priced rows, plus Summary and All Activity", () => {
    const sheets = buildAccountantSheets({
      date: "2026-09-01",
      entries: [entry({ id: "1", amount: 500 }), entry({ id: "2", module: "expenses", amount: 40 }), entry({ id: "3", module: "customers", activity: "Customer Added" })],
      summary: [{ label: "Total billed", value: 500 }],
      split: emptySplit(),
      cash,
      closing: null,
      adjustments: [],
    });
    expect(sheets.map((s) => s.name)).toEqual(["Summary", "Sales", "Expenses", "All Activity"]);
    expect(sheets.find((s) => s.name === "All Activity")!.rows).toHaveLength(3);
    expect(sheets[1].rows[0]["Voucher Type"]).toBe("Sales");
  });
});

describe("compactSummary", () => {
  it("collapses newlines and bold markers into one line", () => {
    expect(compactSummary("*Title*\n\nLine one\nLine two")).toBe("Title • Line one • Line two");
  });
  it("truncates to the limit", () => {
    expect(compactSummary("x".repeat(50), 10)).toHaveLength(10);
  });
});
