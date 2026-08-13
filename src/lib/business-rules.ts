// Pure business-logic ports from Stitching_Manager_Pro_v16.html.
// These are correctness-critical — the numbers/thresholds here must match the old app exactly
// (see plan doc: loyalty math, due-date badges, balance derivation, WhatsApp templates).

export const STAGES = ["received", "cutting", "stitching", "ready", "delivered", "payment"] as const;
export type Stage = (typeof STAGES)[number];

/** getNext(), line ~2196. Returns null once at the last stage. */
export function getNextStage(status: string): Stage | null {
  const i = STAGES.indexOf(status as Stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

export type Lining = "s" | "h" | "f";

/** LINING, line ~1817. */
export const LINING_LABELS: Record<Lining, string> = { s: "Simple", h: "Half Lining", f: "Full Lining" };

/** DEF_RATES, line ~1765 — default per-garment rate card by lining tier. */
export const DEFAULT_RATES: Record<string, Record<Lining, number>> = {
  "Pant Suit": { s: 700, h: 1000, f: 1400 },
  "Pallazo Suit": { s: 600, h: 1000, f: 1400 },
  "Simple Suit": { s: 600, h: 1000, f: 1300 },
  "Simple Kurti": { s: 400, h: 600, f: 900 },
  Pant: { s: 350, h: 600, f: 900 },
  Pallazo: { s: 400, h: 500, f: 700 },
  "Simple Blouse": { s: 800, h: 850, f: 1500 },
  "Designer Blouse": { s: 1000, h: 1800, f: 2500 },
  Lehenga: { s: 1200, h: 1800, f: 2500 },
  "Saree Fall/Piko": { s: 120, h: 120, f: 120 },
};

/** newId(), line ~2211. */
export function newOrderId(): string {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 7).toUpperCase()
      : Math.random().toString(36).substring(2, 9).toUpperCase();
  return `SOR-${rand}`;
}

/** custId(), line ~2214. */
export function customerIdFromMobile(mobile: string): string {
  return `CUST-${mobile}`;
}

/** fmtNow(), line ~2173 — used in history log lines. Always formats in IST regardless of server timezone. */
export function fmtNow(): string {
  return new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export interface StageMeta {
  id: Stage;
  label: string;
  emoji: string;
  color: string;
  bg: string;
  border: string;
}

/** STAGES metadata, line ~1722. */
export const STAGE_META: Record<Stage, StageMeta> = {
  received: { id: "received", label: "Received", emoji: "📥", color: "#18181B", bg: "#FAFAFA", border: "#E4E4E7" },
  cutting: { id: "cutting", label: "Cutting", emoji: "✂️", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  stitching: { id: "stitching", label: "Stitching", emoji: "🧵", color: "#374151", bg: "#FAFAFA", border: "#E4E4E7" },
  ready: { id: "ready", label: "Ready", emoji: "✅", color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
  delivered: { id: "delivered", label: "Delivered", emoji: "🚚", color: "#0891B2", bg: "#ECFEFF", border: "#A5F3FC" },
  payment: { id: "payment", label: "Paid ✓", emoji: "💰", color: "#065F46", bg: "#D1FAE5", border: "#6EE7B7" },
};

export interface LoyaltyConfig {
  enabled: boolean;
  earnPer100: number;
  orderBonus: number;
  deliveryBonus: number;
  redeemPer100pts: number;
  minRedeem: number;
  tierSilver: number;
  tierGold: number;
  tierPlatinum: number;
}

// DEF_LOYALTY, line ~1823
export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  enabled: true,
  earnPer100: 5,
  orderBonus: 10,
  deliveryBonus: 20,
  redeemPer100pts: 10,
  minRedeem: 100,
  tierSilver: 500,
  tierGold: 2000,
  tierPlatinum: 5000,
};

export interface LoyaltyTier {
  label: "Bronze" | "Silver" | "Gold" | "Platinum";
  emoji: string;
  color: string;
  bg: string;
}

/** loyaltyTier(), line ~1974. Keyed off total_points_earned (lifetime), not current balance. */
export function loyaltyTier(totalEarned: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): LoyaltyTier {
  if (totalEarned >= (cfg.tierPlatinum || 5000)) {
    return { label: "Platinum", emoji: "💎", color: "#374151", bg: "#F4F4F5" };
  }
  if (totalEarned >= (cfg.tierGold || 2000)) {
    return { label: "Gold", emoji: "🥇", color: "#B45309", bg: "#FEF3C7" };
  }
  if (totalEarned >= (cfg.tierSilver || 500)) {
    return { label: "Silver", emoji: "🥈", color: "#475569", bg: "#F1F5F9" };
  }
  return { label: "Bronze", emoji: "🥉", color: "#92400E", bg: "#FEF3C7" };
}

/** Derives calendar days between today and a delivery date (yyyy-mm-dd), floor of the difference. */
export function daysLeft(deliveryDate: string): number {
  if (!deliveryDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deliveryDate);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export interface DueBadge {
  text: string;
  bg: string;
  color: string;
  urgent: boolean;
}

/** dueBadge(), line ~2217. Returns null for delivered/payment stages (no due date pressure). */
export function dueBadge(order: { status: string; deliveryDate: string }): DueBadge | null {
  if (order.status === "delivered" || order.status === "payment") return null;
  if (!order.deliveryDate) return null; // no date set — don't falsely show "Due TODAY!"
  const d = daysLeft(order.deliveryDate);
  if (d < 0) return { text: `${Math.abs(d)}d OVERDUE`, bg: "#FEE2E2", color: "#991B1B", urgent: true };
  if (d === 0) return { text: "Due TODAY!", bg: "#FEF3C7", color: "#92400E", urgent: true };
  if (d === 1) return { text: "Due tmr", bg: "#FEF9C3", color: "#713F12", urgent: false };
  return { text: `${d}d left`, bg: "#F0FDF4", color: "#065F46", urgent: false };
}

/** Balance is always derived, never trusted from a stored column. mapRow/toRow, lines ~2265-2323. */
export function deriveBalance(total: number, advance: number): number {
  return Math.max(0, (total || 0) - (advance || 0));
}

// ── Loyalty point redemption math (PaymentModal, lines ~4154-4160) ──────────
export interface RedemptionResult {
  canRedeem: boolean;
  maxPtDiscount: number;
  ptsToRedeem: number;
}

/**
 * Computes the max ₹ discount and exact points consumed for a redemption.
 * ptsToRedeem always rounds UP to the nearest 100-pt block that funds maxPtDiscount —
 * this asymmetry (floor for the discount cap, ceil for points spent) is intentional
 * and must not be "simplified" — changing it changes how many points customers lose.
 */
export function computeRedemption(
  availablePoints: number,
  balanceDue: number,
  cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG
): RedemptionResult {
  const minRedeem = cfg.minRedeem || 100;
  const redeemPer100 = cfg.redeemPer100pts || 10;
  const canRedeem = availablePoints >= minRedeem;
  const maxPtDiscount = canRedeem
    ? Math.min(Math.floor(availablePoints / 100) * redeemPer100, balanceDue)
    : 0;
  const ptsToRedeem = maxPtDiscount > 0 ? Math.ceil(maxPtDiscount / redeemPer100) * 100 : 0;
  return { canRedeem, maxPtDiscount, ptsToRedeem };
}

/**
 * Earn-points formula shared by order creation (paid-in-full) and payment completion.
 * awardLoyaltyPoints must be called at most ONCE per order reaching balance 0 — see
 * lines ~17002-17010 (creation path) and ~17102-17109 (payment path): the order bonus
 * is granted exactly once, whichever path first brings the balance to zero.
 */
export function computeEarnPoints(orderTotal: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  return Math.floor((orderTotal || 0) / 100) * (cfg.earnPer100 || 5) + (cfg.orderBonus || 10);
}

/** Awarded once when an order transitions to "delivered" (line ~16933). */
export function deliveryBonusPoints(cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  return cfg.deliveryBonus || 20;
}

/**
 * Sum of loyalty-point discounts applied to an order via the Payment modal.
 * These were rolled into `advance` (so the balance is correct) but are NOT real cash —
 * they must be excluded from "collected" revenue. Parsed from history lines like
 * "💰 Payment ₹X via UPI + 🎁 ₹Y loyalty pts". Line ~2387.
 */
export function loyaltyDiscountOf(order: { history?: string[] }): number {
  return (order.history || []).reduce((sum, h) => {
    if (!h || typeof h !== "string") return sum;
    // Matches both creation path ("🎁 ₹N loyalty pts applied") and payment path ("🎁 ₹N loyalty pts")
    const m = h.match(/🎁\s+₹(\d+)/);
    return sum + (m ? parseInt(m[1], 10) || 0 : 0);
  }, 0);
}

// ── WhatsApp deep links (openWA, lines ~2245-2264) ──────────────────────────
export type WhatsAppMessageType = "received" | "ready" | "overdue" | "delivered" | "payment" | "paymentDue";

export interface Shop {
  name?: string;
  phone?: string;
}

export interface WhatsAppOrder {
  id: string;
  name: string;
  mobile: string;
  balance?: number;
  deliveryDate: string;
  garments?: { type: string }[];
}

function fmtDateIN(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildWhatsAppMessage(order: WhatsAppOrder, type: WhatsAppMessageType, shop?: Shop): string {
  const ph = shop?.phone || "";
  const sn = shop?.name || "SWAROOP";
  const gs = (order.garments || []).map((g) => g.type).join(", ");
  const messages: Record<WhatsAppMessageType, string> = {
    received: `Dear *${order.name}*🙏\n\nYour Stitching Order *${order.id}* Received at *${sn}* Boutique.\n🗓️ Delivery Date is: *${fmtDateIN(order.deliveryDate)}*\n We will notify you when Ready! Thanks.🌸\n📞 ${ph}\n🛍️ Shop Online: https://swarooponline.com`,
    ready: `Dear *${order.name}*✅\n\nYour Stitching Order *${order.id}* is *READY!* 🎉\n${gs}. Please Collect soon !.\n💰 Balance Payment is : *₹${order.balance || 0}*\n📞 *${ph}*\n_${sn}_ 🌸\n🛍️ Shop Online: https://swarooponline.com`,
    overdue: `Dear *${order.name}* 🙏\n\nYour Stitching Order *${order.id}* was due on *${fmtDateIN(order.deliveryDate)}* and is still in progress.\nWe sincerely apologize for the delay. We will notify you as soon as it is Ready! 🙏\n📞 ${ph}\n_${sn}_\n🛍️ Shop Online: https://swarooponline.com`,
    delivered: `Dear *${order.name}*💐\n Thank you for collecting your garments from *${sn}!* 😍\nPlease Review on Google ! Click Below⭐\n🌐 https://g.page/r/CUqo_lixUDSBEAE/review\n🛍️ Shop Online: https://swarooponline.com`,
    payment: `Dear *${order.name}*🙏\nPayment of *₹${order.balance || 0}* received. Thank you! 💚\n_${sn}_ ✂️\n🛍️ Shop Online: https://swarooponline.com`,
    paymentDue: `Dear *${order.name}* 🙏\n\n₹${order.balance || 0} is due against your stitching order *${order.id}*.\nPlease clear at your earliest convenience.\n📞 ${ph}\n_${sn}_`,
  };
  return messages[type] || messages.received;
}

/** Strips leading +91/91 prefix so it isn't double-applied — mirrors lines ~2258-2260. */
export function normalizeIndianMobile(mobile: string): string {
  let raw = String(mobile || "").trim().replace(/^\+/, "");
  if (raw.startsWith("91") && raw.length > 10) raw = raw.slice(2);
  return raw;
}

export function buildWhatsAppUrl(order: WhatsAppOrder, type: WhatsAppMessageType, shop?: Shop): string {
  const mobile = normalizeIndianMobile(order.mobile);
  const message = buildWhatsAppMessage(order, type, shop);
  return `https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`;
}
