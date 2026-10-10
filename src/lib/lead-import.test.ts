import { describe, expect, it } from "vitest";
import { exportRowForLead, parseImportRow, resolveImportStage } from "@/lib/lead-import";

describe("parseImportRow", () => {
  it("reads the template columns", () => {
    const r = parseImportRow({ Name: " Asha ", Mobile: 9876543210, "What they want": "Lehenga", "Expected ₹": "₹12,500", Source: "Instagram", Owner: "Ravi", Stage: "Talking", "Likely to close": "Yes", Notes: "call after 5" });
    expect(r).toEqual({ name: "Asha", mobile: "9876543210", productInterest: "Lehenga", expectedValue: 12500, source: "Instagram", owner: "Ravi", stage: "talking", likelyToClose: true, notes: "call after 5" });
  });
  it("accepts alternative headings and blanks", () => {
    const r = parseImportRow({ "Customer Name": "Bala", "Phone No": "98765 43210", Amount: 0 });
    expect(r.name).toBe("Bala");
    expect(r.mobile).toBe("98765 43210");
    expect(r.expectedValue).toBe(0);
    expect(r.stage).toBe("");
    expect(r.likelyToClose).toBeNull();
  });
});

describe("resolveImportStage", () => {
  it("matches keys and renamed labels, never won/lost", () => {
    expect(resolveImportStage("Quoted")).toBe("quoted");
    expect(resolveImportStage("Sent quote", { quoted: "Sent quote" })).toBe("quoted");
    expect(resolveImportStage("Won")).toBe("");
    expect(resolveImportStage("lost")).toBe("");
  });
});

describe("exportRowForLead", () => {
  const lead = { name: "Asha", mobile: "9876543210", productInterest: "Lehenga", expectedValue: 5000, source: "Instagram", stage: "new", likelyToClose: false, notes: "", wonValue: 0, lostReason: "", createdAt: "2026-09-30T20:00:00.000Z" };
  it("dates a lead by the shop's (IST) calendar day — 1:30 am IST on the 1st is not still September", () => {
    expect(exportRowForLead(lead, "Ravi")["Added on"]).toBe("2026-10-01");
    expect(exportRowForLead({ ...lead, createdAt: "2026-09-30T10:00:00.000Z" }, "Ravi")["Added on"]).toBe("2026-09-30");
  });
});
