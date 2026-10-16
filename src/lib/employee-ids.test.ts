import { describe, expect, it } from "vitest";
import { scrubEmployeeIds } from "./employee-ids";

const ID = "523b66eb-9311-40c5-8301-08ec6fcc2008";

describe("scrubEmployeeIds", () => {
  it("swaps a bare id for the name", () => {
    expect(scrubEmployeeIds(`15 Oct — emp-${ID}: raw material No material`, new Map([[ID, "Manisha Yadav"]]))).toBe("15 Oct — Manisha Yadav: raw material No material");
  });
  it("handles the login-address form and several ids", () => {
    expect(scrubEmployeeIds(`emp-${ID}@dashboard.local moved to emp-${ID}`, new Map([[ID, "Faiz"]]))).toBe("Faiz moved to Faiz");
  });
  it("never leaks an unknown id", () => {
    expect(scrubEmployeeIds(`by emp-${ID}`)).toBe("by Staff");
  });
  it("leaves ordinary text and empty values alone", () => {
    expect(scrubEmployeeIds("Received — 09 Oct by Manisha Yadav")).toBe("Received — 09 Oct by Manisha Yadav");
    expect(scrubEmployeeIds(null)).toBe("");
  });
});
