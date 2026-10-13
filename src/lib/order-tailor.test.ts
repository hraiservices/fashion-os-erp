import { describe, expect, it } from "vitest";
import { orderTailorIds, orderTailorLabel } from "./order-tailor";

const name = (id: string) => ({ a: "Rahul", b: "Narendra" })[id as "a"] ?? id;
const g = (tailor?: string) => ({ tailor }) as never;

describe("order tailor", () => {
  it("uses the garments' tailors over the order-level one", () => {
    expect(orderTailorLabel({ tailor: "b", garments: [g("a")] }, name)).toBe("Rahul");
  });
  it("shows how many more when split", () => {
    expect(orderTailorLabel({ tailor: "b", garments: [g("a"), g("b"), g("a")] }, name)).toBe("Rahul +1");
  });
  it("falls back to the order-level tailor, then to nothing", () => {
    expect(orderTailorLabel({ tailor: "b", garments: [g(), g("")] }, name)).toBe("Narendra");
    expect(orderTailorIds({ tailor: "", garments: [g()] })).toEqual([]);
    expect(orderTailorLabel({ tailor: "", garments: [] }, name)).toBe("");
  });
});
