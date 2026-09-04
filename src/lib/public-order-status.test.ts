import { describe, it, expect } from "vitest";
import { parseHistoryLine } from "./public-order-status";

describe("parseHistoryLine", () => {
  it("strips staff attribution", () => {
    expect(parseHistoryLine("📥 Received — 04 Sep, 10:30 am by Himanshu Rajput")).toEqual({
      emoji: "📥",
      label: "Received",
      when: "04 Sep, 10:30 am",
    });
  });

  it("strips trailing badges after the attribution", () => {
    expect(parseHistoryLine("📥 Received — 04 Sep, 10:30 am by Himanshu Rajput · 💳 Cash · 🎁 ₹50 loyalty pts applied")).toEqual({
      emoji: "📥",
      label: "Received",
      when: "04 Sep, 10:30 am",
    });
  });

  it("handles a multi-word label", () => {
    expect(parseHistoryLine("💰 Paid ✓ — 05 Sep, 11:00 am by Front Desk")).toEqual({
      emoji: "💰",
      label: "Paid ✓",
      when: "05 Sep, 11:00 am",
    });
  });

  it("degrades gracefully on an unrecognised format", () => {
    expect(parseHistoryLine("Something unexpected")).toEqual({
      emoji: "Something",
      label: "unexpected",
      when: "",
    });
  });

  it("falls back entirely when there's no space to split on", () => {
    expect(parseHistoryLine("no-spaces-here")).toEqual({
      emoji: "",
      label: "no-spaces-here",
      when: "",
    });
  });
});
