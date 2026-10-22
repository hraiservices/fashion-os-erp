/** The WhatsApp invite sent to a recently-delivered customer, nudging them to refer a friend with
 *  the coupon code just issued for them (see /api/customers/[mobile]/referral-coupon). Pure. */
export function referralInviteMessage(name: string, code: string, discountAmount: number, shopName: string): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  const shop = shopName || "us";
  return `Hi ${first}! Hope you're loving your outfit from ${shop} 😊 Know someone who'd love a custom stitch too? Share this code with them — they get ₹${discountAmount} off their first order: ${code}`;
}
