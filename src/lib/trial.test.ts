import { describe, expect, it } from "vitest";
import { mobileFromTrial, prettyTime, trialDescription, trialMessage, trialTitle } from "./trial";

describe("trial helpers", () => {
  it("round-trips the mobile through the description", () => {
    expect(mobileFromTrial(trialDescription("9876543210", "A12"))).toBe("9876543210");
    expect(mobileFromTrial("nothing here")).toBe("");
  });
  it("formats times", () => {
    expect(prettyTime("17:30")).toBe("5:30 PM");
    expect(prettyTime("00:05")).toBe("12:05 AM");
    expect(prettyTime("")).toBe("");
  });
  it("builds the title and messages", () => {
    expect(trialTitle("Asha", "A12", "5:30 PM")).toBe("Trial 5:30 PM — Asha (A12)");
    expect(trialMessage({ name: "Asha Rao", shop: "Rose", dateLabel: "Sat 18 Oct", time: "5:30 PM" })).toContain("booked for Sat 18 Oct at 5:30 PM");
    expect(trialMessage({ name: "Asha Rao", shop: "Rose", dateLabel: "tomorrow", time: "", reminder: true })).toContain("reminder");
  });
});
