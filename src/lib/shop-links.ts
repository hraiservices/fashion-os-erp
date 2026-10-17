/** The UPI ID customers pay to. Stored under app_settings "shopLinks" (not secret). The Google review link already lives in Shop Profile. */

export interface ShopLinks {
  upiId: string;
  upiName: string;
}

export const SHOP_LINKS_KEY = "shopLinks";
export const DEFAULT_SHOP_LINKS: ShopLinks = { upiId: "", upiName: "" };

/** name@bank — letters, digits, dots, dashes and underscores on the left, letters on the right. */
export const isValidUpiId = (v: string) => /^[\w.-]{2,}@[a-zA-Z][a-zA-Z0-9]{1,}$/.test(v.trim());

/** A UPI deep link: opens the customer's UPI app with the payee and amount filled in. */
export function buildUpiLink(links: Pick<ShopLinks, "upiId" | "upiName">, amount: number, note: string): string {
  const q = new URLSearchParams({ pa: links.upiId.trim(), pn: links.upiName.trim() || "Shop", cu: "INR" });
  if (amount > 0) q.set("am", amount.toFixed(2));
  if (note.trim()) q.set("tn", note.trim().slice(0, 50));
  return `upi://pay?${q.toString()}`;
}
