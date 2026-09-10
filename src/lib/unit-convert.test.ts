import { describe, it, expect } from "vitest";
import { convertLength } from "@/lib/unit-convert";

function close(a: number, b: number, eps = 1e-9) {
  expect(Math.abs(a - b)).toBeLessThan(eps);
}

describe("convertLength", () => {
  it("converts inches to cm/m/ft correctly", () => {
    const out = convertLength(10, "in");
    close(out.in, 10);
    close(out.cm, 25.4);
    close(out.m, 0.254);
    close(out.ft, 10 / 12);
  });

  it("converts cm to inches correctly", () => {
    const out = convertLength(2.54, "cm");
    close(out.in, 1);
  });

  it("converts meters to feet correctly", () => {
    const out = convertLength(1, "m");
    close(out.ft, 3.280839895, 1e-6);
  });

  it("round-trips zero", () => {
    const out = convertLength(0, "ft");
    close(out.in, 0);
    close(out.cm, 0);
    close(out.m, 0);
  });
});
