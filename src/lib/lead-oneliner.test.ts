import { describe, expect, it } from "vitest";
import { leadOneLiner } from "@/lib/lead-oneliner";
import { usualReplyWindow } from "@/lib/reply-time";

const lead = { stage: "quoted", outfitType: "Bridal lehenga", pieces: 2, productInterest: "", budgetMin: 20000, budgetMax: 25000, neededBy: "2026-11-12", expectedValue: 0 };

describe("leadOneLiner", () => {
  it("joins the useful facts", () => {
    expect(leadOneLiner(lead, "2026-10-18", "hot")).toBe("Hot quoted lead · Bridal lehenga × 2 · ₹20,000–₹25,000 · needed in 25 days");
  });
  it("copes with a bare lead", () => {
    expect(leadOneLiner({ ...lead, outfitType: "", pieces: 0, budgetMin: 0, budgetMax: 0, neededBy: null }, "2026-10-18")).toBe("Quoted lead");
  });
  it("says when the date has passed", () => {
    expect(leadOneLiner({ ...lead, neededBy: "2026-10-15" }, "2026-10-18")).toContain("needed 3 days ago");
  });
});

const msg = (iso: string) => ({ kind: "whatsapp", body: "Customer: hi", createdAt: iso });
describe("usualReplyWindow", () => {
  it("finds an evening habit (IST)", () => {
    // 13:00Z = 18:30 IST
    const r = usualReplyWindow([msg("2026-10-01T13:00:00Z"), msg("2026-10-03T13:20:00Z"), msg("2026-10-06T12:40:00Z"), msg("2026-10-08T04:00:00Z")]);
    expect(r?.label).toBe("6 pm–8 pm");
  });
  it("needs enough messages and a clear pattern", () => {
    expect(usualReplyWindow([msg("2026-10-01T13:00:00Z")])).toBeNull();
    expect(usualReplyWindow([msg("2026-10-01T01:00:00Z"), msg("2026-10-02T07:00:00Z"), msg("2026-10-03T13:00:00Z"), msg("2026-10-04T18:00:00Z")])).toBeNull();
  });
  it("ignores the shop's own messages", () => {
    expect(usualReplyWindow([{ kind: "whatsapp", body: "Shop: hello", createdAt: "2026-10-01T13:00:00Z" }, msg("2026-10-02T13:00:00Z"), msg("2026-10-03T13:00:00Z")])).toBeNull();
  });
});
