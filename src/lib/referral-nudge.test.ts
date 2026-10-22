import { describe, expect, it } from "vitest";
import { referralInviteMessage } from "@/lib/referral-nudge";

describe("referralInviteMessage", () => {
  it("includes the first name, code, and discount", () => {
    const msg = referralInviteMessage("Meera Shah", "REF-AB12CD", 100, "Swaroop Boutique");
    expect(msg).toContain("Hi Meera!");
    expect(msg).toContain("REF-AB12CD");
    expect(msg).toContain("₹100 off");
    expect(msg).toContain("Swaroop Boutique");
  });

  it("falls back to 'there' and 'us' when name/shop are blank", () => {
    const msg = referralInviteMessage("  ", "REF-XYZ999", 50, "");
    expect(msg).toContain("Hi there!");
    expect(msg).toContain("from us");
  });
});
