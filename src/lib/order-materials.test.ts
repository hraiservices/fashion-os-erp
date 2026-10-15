import { describe, expect, it } from "vitest";
import { daysWaiting, isWorkAvailable, materialBadgeLabel, materialStatus, missingMaterials, normalizeMaterials, parseMaterials } from "./order-materials";

const item = (key: "lining" | "buttons" | "reels" | "other", received: boolean, label: string = key) => ({ key, label, received });

describe("materialStatus", () => {
  it("is untracked with no items", () => expect(materialStatus([])).toBe("untracked"));
  it("is waiting / partial / complete", () => {
    expect(materialStatus([item("lining", false), item("buttons", false)])).toBe("waiting");
    expect(materialStatus([item("lining", true), item("buttons", false)])).toBe("partial");
    expect(materialStatus([item("lining", true), item("buttons", true)])).toBe("complete");
  });
});

describe("badge + missing", () => {
  it("labels each state", () => {
    expect(materialBadgeLabel([])).toBe("");
    expect(materialBadgeLabel([item("lining", false)])).toBe("No material");
    expect(materialBadgeLabel([item("lining", true), item("buttons", false)])).toBe("Material 1/2");
    expect(materialBadgeLabel([item("lining", true)])).toBe("Material in");
  });
  it("lists what is missing", () => {
    expect(missingMaterials([item("lining", true, "Lining"), item("buttons", false, "Buttons"), item("reels", false, "Reels")])).toBe("Buttons, Reels");
  });
});

describe("isWorkAvailable", () => {
  it("needs the received stage and every material in", () => {
    expect(isWorkAvailable({ status: "received", orderType: "new", materials: [item("lining", true)] })).toBe(true);
    expect(isWorkAvailable({ status: "cutting", orderType: "new", materials: [item("lining", true)] })).toBe(false);
    expect(isWorkAvailable({ status: "received", orderType: "new", materials: [item("lining", false)] })).toBe(false);
    expect(isWorkAvailable({ status: "received", orderType: "new", materials: [] })).toBe(false);
  });
});

describe("parse / normalize", () => {
  it("drops junk and unknown keys", () => {
    expect(parseMaterials("x")).toEqual([]);
    expect(parseMaterials([null, 3, { key: "nope" }, { key: "lining", received: true }])).toEqual([{ key: "lining", label: "Lining", received: true }]);
  });
  it("de-duplicates, trims labels, stamps time once", () => {
    const first = normalizeMaterials([{ key: "lining", received: true }, { key: "lining", received: false }, { key: "other", label: " Zip ", received: false }], [], "2026-10-14T10:00:00.000Z");
    expect(first).toEqual([
      { key: "lining", label: "Lining", received: true, at: "2026-10-14T10:00:00.000Z" },
      { key: "other", label: "Zip", received: false },
    ]);
    const again = normalizeMaterials([{ key: "lining", received: true }], first, "2026-10-15T09:00:00.000Z");
    expect(again[0].at).toBe("2026-10-14T10:00:00.000Z");
  });
  it("clears the time when un-received", () => {
    const prev = normalizeMaterials([{ key: "buttons", received: true }], [], "2026-10-14T10:00:00.000Z");
    expect(normalizeMaterials([{ key: "buttons", received: false }], prev)[0]).toEqual({ key: "buttons", label: "Buttons", received: false });
  });
});

describe("daysWaiting", () => {
  it("counts whole days and never goes negative", () => {
    expect(daysWaiting("2026-10-10", new Date(2026, 9, 14))).toBe(4);
    expect(daysWaiting("2026-10-20", new Date(2026, 9, 14))).toBe(0);
    expect(daysWaiting("", new Date(2026, 9, 14))).toBe(0);
  });
});

import { buildMaterialAvailability } from "./order-materials";
import type { Order } from "./types";

function ord(over: Partial<Order>): Order {
  return { id: "O", status: "received", orderType: "new", inDate: "2026-10-10", deliveryDate: "2026-10-20", materials: [], ...over } as Order;
}

describe("buildMaterialAvailability", () => {
  const today = new Date(2026, 9, 14);
  const label = (o: Order) => o.tailor || "";
  it("splits ready, waiting and unrecorded", () => {
    const orders = [
      ord({ id: "A", materials: [item("lining", true)], deliveryDate: "2026-10-25" }),
      ord({ id: "B", materials: [item("lining", true)], deliveryDate: "2026-10-18" }),
      ord({ id: "C", materials: [item("lining", false)], inDate: "2026-10-08" }),
      ord({ id: "D", materials: [item("lining", true), item("buttons", false)], inDate: "2026-10-12", status: "cutting" }),
      ord({ id: "E" }),
      ord({ id: "F", orderType: "alteration" }),
      ord({ id: "G", materials: [item("lining", true)], status: "cutting" }),
      ord({ id: "H", materials: [item("lining", false)], status: "ready" }),
    ];
    const r = buildMaterialAvailability(orders, label, today);
    expect(r.ready.map((x) => x.order.id)).toEqual(["B", "A"]);
    expect(r.waiting.map((x) => x.order.id)).toEqual(["C", "D"]);
    expect(r.waiting[0].days).toBe(6);
    expect(r.waiting[1].missing).toBe("buttons");
    expect(r.unrecorded.map((x) => x.order.id)).toEqual(["E"]);
  });
});
