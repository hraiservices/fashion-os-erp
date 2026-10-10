import { describe, it, expect } from "vitest";
import { DEFAULT_STAGE_LABELS, isLeadStage, isOpenStage, LEAD_STAGES, stageLabel, validateStageChange, wonValueFor } from "./lead-stages";

describe("lead stages", () => {
  it("has the five pipeline words plus Lost", () => {
    expect(LEAD_STAGES).toEqual(["new", "talking", "visit", "quoted", "won", "lost"]);
  });
  it("recognises stage keys", () => {
    expect(isLeadStage("quoted")).toBe(true);
    expect(isLeadStage("negotiation")).toBe(false);
    expect(isLeadStage(undefined)).toBe(false);
  });
  it("treats only the first four as open", () => {
    expect(["new", "talking", "visit", "quoted"].every(isOpenStage)).toBe(true);
    expect(isOpenStage("won")).toBe(false);
    expect(isOpenStage("lost")).toBe(false);
  });
  it("uses the default label, or the shop's renamed one", () => {
    expect(stageLabel("talking")).toBe(DEFAULT_STAGE_LABELS.talking);
    expect(stageLabel("talking", { talking: "In conversation" })).toBe("In conversation");
    expect(stageLabel("talking", { talking: "   " })).toBe("Talking");
  });
});

describe("validateStageChange", () => {
  it("allows moving between any stages", () => {
    expect(validateStageChange({ from: "new", to: "quoted" })).toBeNull();
    expect(validateStageChange({ from: "quoted", to: "new" })).toBeNull();
    expect(validateStageChange({ from: "won", to: "talking" })).toBeNull();
  });
  it("requires a reason for Lost", () => {
    expect(validateStageChange({ from: "new", to: "lost" })).toMatch(/reason/i);
    expect(validateStageChange({ from: "new", to: "lost", lostReason: "  " })).toMatch(/reason/i);
    expect(validateStageChange({ from: "new", to: "lost", lostReason: "Price too high" })).toBeNull();
  });
  it("rejects unknown stages", () => {
    expect(validateStageChange({ from: "new", to: "bogus" })).toBe("Unknown stage");
  });
});

describe("wonValueFor", () => {
  it("prefers what was entered", () => {
    expect(wonValueFor({ enteredValue: 12000, expectedValue: 5000 })).toBe(12000);
  });
  it("falls back to the expected value", () => {
    expect(wonValueFor({ enteredValue: null, expectedValue: 5000 })).toBe(5000);
    expect(wonValueFor({ enteredValue: 0, expectedValue: 5000 })).toBe(5000);
    expect(wonValueFor({ enteredValue: -3, expectedValue: 5000 })).toBe(5000);
  });
});
