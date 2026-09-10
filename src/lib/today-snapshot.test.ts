import { describe, it, expect } from "vitest";
import { computeTodaySnapshot } from "@/lib/today-snapshot";
import { istDateString } from "@/lib/ist-date";
import type { Order, OrderPayment, SalesPayment } from "@/lib/types";

function daysFromToday(n: number): string {
  return istDateString(new Date(Date.now() + n * 86_400_000));
}

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: "SOR-1",
    name: "Test Customer",
    mobile: "9999999999",
    inDate: daysFromToday(-2),
    deliveryDate: daysFromToday(0),
    inTime: "",
    deliveryTime: "",
    garments: [],
    total: 1000,
    advance: 0,
    balance: 1000,
    tailor: "",
    status: "stitching",
    special: "",
    history: [],
    measurements: {},
    images: [],
    audios: [],
    videos: [],
    payments: [],
    payBreakdown: null,
    orderType: "new",
    bookingSource: "",
    fabricCost: 0,
    otherCost: 0,
    reworkFlag: false,
    reworkReason: "",
    reworkFlaggedBy: null,
    reworkFlaggedAt: null,
    readyAt: null,
    payablesConfirmedAt: null,
    payablesConfirmedBy: null,
    pieceRatePaidAt: null,
    rawStatus: "stitching",
    createdAt: new Date().toISOString(),
    groupId: null,
    measurementProfileId: null,
    measurementProfileName: null,
    ...overrides,
  };
}

function makeOrderPayment(overrides: Partial<OrderPayment>): OrderPayment {
  return {
    id: "p1",
    orderId: "SOR-1",
    amount: 100,
    ptDiscount: 0,
    ptsRedeemed: 0,
    method: "Cash",
    note: "",
    createdBy: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSalesPayment(overrides: Partial<SalesPayment>): SalesPayment {
  return {
    id: "sp1",
    invoiceId: "INV-1",
    customerMobile: "9999999999",
    amount: 200,
    method: "Cash",
    date: istDateString(),
    note: "",
    posSessionId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeTodaySnapshot", () => {
  it("lists an order due today (not yet delivered/paid) under dueToday", () => {
    const orders = [makeOrder({ id: "A", deliveryDate: daysFromToday(0), status: "stitching" })];
    const snap = computeTodaySnapshot(orders, [], []);
    expect(snap.dueToday.map((o) => o.id)).toEqual(["A"]);
  });

  it("excludes delivered/paid orders from dueToday even if delivery date is today", () => {
    const orders = [
      makeOrder({ id: "A", deliveryDate: daysFromToday(0), status: "delivered" }),
      makeOrder({ id: "B", deliveryDate: daysFromToday(0), status: "payment" }),
    ];
    const snap = computeTodaySnapshot(orders, [], []);
    expect(snap.dueToday).toEqual([]);
  });

  it("counts overdue-with-balance and due-today-with-balance orders as pending", () => {
    const orders = [
      makeOrder({ id: "A", deliveryDate: daysFromToday(-3), balance: 500, status: "stitching" }),
      makeOrder({ id: "B", deliveryDate: daysFromToday(0), balance: 300, status: "stitching" }),
      makeOrder({ id: "C", deliveryDate: daysFromToday(2), balance: 999, status: "stitching" }), // not yet due
      makeOrder({ id: "D", deliveryDate: daysFromToday(-1), balance: 0, status: "stitching" }), // overdue but paid off
    ];
    const snap = computeTodaySnapshot(orders, [], []);
    expect(snap.pendingCount).toBe(2);
    expect(snap.pendingTotal).toBe(800);
  });

  it("sums today's order payments and sales payments together", () => {
    const orderPayments = [makeOrderPayment({ amount: 150, createdAt: new Date().toISOString() })];
    const salesPayments = [makeSalesPayment({ amount: 250, date: istDateString() })];
    const snap = computeTodaySnapshot([], orderPayments, salesPayments);
    expect(snap.collectedToday).toBe(400);
  });

  it("excludes payments from other days", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const orderPayments = [makeOrderPayment({ amount: 999, createdAt: yesterday })];
    const salesPayments = [makeSalesPayment({ amount: 999, date: daysFromToday(-1) })];
    const snap = computeTodaySnapshot([], orderPayments, salesPayments);
    expect(snap.collectedToday).toBe(0);
  });
});
