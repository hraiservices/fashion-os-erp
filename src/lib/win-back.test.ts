import { describe, expect, it } from "vitest";
import { winBackCandidates, winBackMessage } from "./win-back";

const lead = (id: string, reason: string, lostAt: string | null, mobile = "9876543210") => ({ id, name: "Asha Rao", mobile, lostReason: reason, lostAt });

describe("winBackCandidates", () => {
  it("keeps recoverable reasons lost 30–120 days ago, oldest first", () => {
    const r = winBackCandidates(
      [lead("a", "Price too high", "2026-08-20T10:00:00Z"), lead("b", "Chose another shop", "2026-08-20T10:00:00Z"), lead("c", "No response", "2026-10-05T10:00:00Z"), lead("d", "Needed it sooner", "2026-07-01T10:00:00Z"), lead("e", "Price too high", "2026-06-01T10:00:00Z"), lead("f", "Price too high", "2026-08-01T10:00:00Z", "")],
      "2026-10-10"
    );
    expect(r.map((l) => l.id)).toEqual(["d", "a"]);
  });
});

describe("winBackMessage", () => {
  it("uses the first name and fits the reason", () => {
    expect(winBackMessage("Asha Rao", "Price too high", "Rose Boutique")).toContain("Hi Asha!");
    expect(winBackMessage("Asha Rao", "Price too high", "Rose Boutique")).toContain("budget");
  });
});
