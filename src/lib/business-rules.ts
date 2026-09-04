// Pure business-logic ports from Stitching_Manager_Pro_v16.html.
// These are correctness-critical — the numbers/thresholds here must match the old app exactly
// (see plan doc: loyalty math, due-date badges, balance derivation, WhatsApp templates).

import { istDateString } from "@/lib/ist-date";
import { DEFAULT_STITCHING_WHATSAPP_TEMPLATES } from "@/lib/stitching-whatsapp";

/** How a customer found the shop — free-choice list, not enforced server-side (a blank/custom
 *  value is fine, this just drives the order-form dropdown and the booking-source report). */
export const BOOKING_SOURCES = ["Walk-in", "Referral", "Repeat Customer", "Instagram", "Other"] as const;

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

/** Shared with the stitching-order payment route (validation) and Day Book/Payment Methods
 *  reports (regex extraction of the method from activity_log's action text, since order
 *  payments have no standalone payments table/column to store it in — see ORDER_PAYMENT_RE). */
export const ORDER_PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer"] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

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

/** Tailor payable rate card — same garment-type × lining shape as DEFAULT_RATES (the customer
 *  price list), but each cell carries two payable amounts: what a tailor is paid for a NEW
 *  garment of that type/lining vs. an ALTERATION, since alterations pay less. Stored under
 *  app_settings key "tailorRates". Snapshotted onto each garment (frozen) the moment its order
 *  first reaches "ready" — see snapshot_tailor_payables() in the DB. */
export interface TailorRate {
  new: number;
  alteration: number;
}
export type TailorRateCard = Record<string, Record<Lining, TailorRate>>;

/** Zero by default for every garment type in DEFAULT_RATES — the shop enters real payable
 *  rates in Settings once this ships; there's no sensible default to guess at. */
export const DEFAULT_TAILOR_RATES: TailorRateCard = Object.fromEntries(
  Object.keys(DEFAULT_RATES).map((type) => [type, { s: { new: 0, alteration: 0 }, h: { new: 0, alteration: 0 }, f: { new: 0, alteration: 0 } }])
);

/** Shop-configurable list of stitching-expense categories (Settings > Stitching Expense
 *  Categories), same "plain string array, admin can add/remove" shape as other simple
 *  app_settings lists in this app. Stored under app_settings key "stitchingExpenseCategories". */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Lining",
  "Thread",
  "Lace",
  "Piping",
  "Buttons",
  "Elastic",
  "Zipper",
  "Hooks",
  "Electricity",
  "Machine Expense",
  "Packaging",
  "Other",
];

/** newId(), line ~2211. */
export function newOrderId(): string {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 7).toUpperCase()
      : Math.random().toString(36).substring(2, 9).toUpperCase();
  return `SOR-${rand}`;
}

/** A manually-typed order number becomes the order's real primary key and is used verbatim as
 *  a URL segment (/orders/[id]) — the exact same trap the auto-generated separator once fell
 *  into (see INVALID_SEPARATOR in document-numbering.ts). Restricted to a small, definitely
 *  URL-safe charset rather than just blocking "/", since a manual field is more likely to see
 *  spaces, quotes, or other characters an auto-formatter would never produce. */
export const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;

export function isValidManualOrderNumber(s: string): boolean {
  return ORDER_NUMBER_PATTERN.test(s);
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
/** Both sides are converted the same UTC-anchored way (no local-timezone interpretation of
 *  either "today" or the target date), so the result is a pure day-count that can't drift by
 *  one depending on what timezone the browser/server happens to be in — the previous version
 *  parsed the delivery date as UTC midnight then normalized it via a LOCAL setHours(0,0,0,0),
 *  which silently shifted the target back a day for anyone (or any server) west of UTC. */
export function daysLeft(deliveryDate: string): number {
  if (!deliveryDate) return 0;
  const toUtcDays = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return toUtcDays(deliveryDate) - toUtcDays(istDateString());
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

// ── Referral coupons ─────────────────────────────────────────────────────────
export const REFERRAL_COUPON_DISCOUNT = 100;
export const REFERRAL_COUPON_VALIDITY_DAYS = 90;
/** Loyalty points credited to the referrer once their coupon is redeemed. Plain constant for
 *  v1, not yet a Settings-configurable value (same treatment as BOOKING_SOURCES). */
export const REFERRAL_BONUS_POINTS = 50;

/**
 * Sum of referral-coupon discounts applied to an order — same "rolled into advance but not
 * real cash" treatment as loyaltyDiscountOf, and must be excluded from "collected" revenue the
 * same way. Parsed from the creation-path history line "🎟️ ₹N referral coupon applied".
 */
export function couponDiscountOf(order: { history?: string[] }): number {
  return (order.history || []).reduce((sum, h) => {
    if (!h || typeof h !== "string") return sum;
    const m = h.match(/🎟️\s+₹(\d+)/);
    return sum + (m ? parseInt(m[1], 10) || 0 : 0);
  }, 0);
}

// ── WhatsApp deep links (openWA, lines ~2245-2264) ──────────────────────────
export type WhatsAppMessageType = "received" | "ready" | "overdue" | "delivered" | "payment" | "paymentDue";

export interface Shop {
  name?: string;
  phone?: string;
  websiteUrl?: string;
  reviewUrl?: string;
}

export interface WhatsAppOrder {
  id: string;
  name: string;
  mobile: string;
  balance?: number;
  deliveryDate: string;
  garments?: { type: string }[];
  /** Customer's public order-status link (/track/[token]), if the caller has one ready.
   *  Omitted entirely (rather than an empty {track_link} line) when absent. */
  trackUrl?: string;
}

function fmtDateIN(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildWhatsAppMessage(order: WhatsAppOrder, type: WhatsAppMessageType, shop?: Shop, templates?: Record<WhatsAppMessageType, string>): string {
  const ph = shop?.phone || "";
  const sn = shop?.name || "Fashion Boutique";
  const gs = (order.garments || []).map((g) => g.type).join(", ");
  // Both lines are shop-configurable (Settings → Shop Profile) and omitted entirely when
  // unset — the original template hardcoded the original deployment's own domain and
  // Google review link, which every other shop running this app would otherwise send
  // to their customers by mistake.
  const websiteLine = shop?.websiteUrl ? `\n🛍️ Shop Online: ${shop.websiteUrl}` : "";
  const reviewLine = shop?.reviewUrl ? `\nPlease Review on Google ! Click Below⭐\n🌐 ${shop.reviewUrl}` : "";
  const balanceLine = order.balance ? `\n💰 Balance Payment is : *₹${order.balance}*` : "";
  const trackLine = order.trackUrl ? `\n📲 Track your order anytime: ${order.trackUrl}` : "";
  const template = templates?.[type] || DEFAULT_STITCHING_WHATSAPP_TEMPLATES[type] || DEFAULT_STITCHING_WHATSAPP_TEMPLATES.received;
  return template
    .replaceAll("{name}", order.name)
    .replaceAll("{order_id}", order.id)
    .replaceAll("{delivery_date}", fmtDateIN(order.deliveryDate))
    .replaceAll("{garments}", gs)
    .replaceAll("{balance}", String(order.balance || 0))
    .replaceAll("{shop_name}", sn)
    .replaceAll("{shop_phone}", ph)
    .replaceAll("{website_line}", websiteLine)
    .replaceAll("{review_line}", reviewLine)
    .replaceAll("{balance_line}", balanceLine)
    .replaceAll("{track_link}", trackLine);
}

/** Strips everything but digits, then a leading 91 country code, so a number typed/exported as
 *  "+91 98765-43210" or "091 9876543210" normalizes to the same plain 10-digit string as
 *  "9876543210". Without stripping spaces/dashes first, a wa.me link built from a mobile
 *  containing them silently breaks, and — the reason this matters for bulk import — customers,
 *  orders and invoices all key off this exact string, so two different formattings of the same
 *  real number become two different (wrong) customer records instead of matching one. */
export function normalizeIndianMobile(mobile: string): string {
  let raw = String(mobile || "").replace(/\D/g, "");
  if (raw.startsWith("91") && raw.length > 10) raw = raw.slice(2);
  return raw;
}

export function buildWhatsAppUrl(order: WhatsAppOrder, type: WhatsAppMessageType, shop?: Shop, templates?: Record<WhatsAppMessageType, string>): string {
  const mobile = normalizeIndianMobile(order.mobile);
  const message = buildWhatsAppMessage(order, type, shop, templates);
  return `https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`;
}

/**
 * Customer-centric WhatsApp messages — deliberately separate from buildWhatsAppUrl/
 * WhatsAppMessageType above, which are order-centric (id/deliveryDate/garments belong to one
 * order, not a customer relationship). Reorder reminders and wardrobe summaries are about a
 * customer's history across many orders, so they don't fit that shape.
 */
export function buildReorderReminderUrl(mobile: string, name: string, lastOrderDate: string, shop?: Shop): string {
  const sn = shop?.name || "Fashion Boutique";
  const ph = shop?.phone || "";
  const message =
    `Dear *${name}* 🙏\n\nIt's been a while since your last order with us on ${fmtDateIN(lastOrderDate)} at *${sn}*.` +
    `\nWe'd love to stitch for you again — same measurements are on file, so it's quick!` +
    `\n📞 ${ph}`;
  return `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(message)}`;
}

export function buildWardrobeSummaryUrl(mobile: string, name: string, orders: { inDate: string; garments?: { type: string }[] }[], shop?: Shop): string {
  const sn = shop?.name || "Fashion Boutique";
  const lines = orders
    .slice()
    .sort((a, b) => (b.inDate || "").localeCompare(a.inDate || ""))
    .map((o) => `• ${fmtDateIN(o.inDate)} — ${(o.garments || []).map((g) => g.type).join(", ") || "—"}`);
  const message = `Dear *${name}* 🙏\n\nHere's everything you've had stitched with *${sn}*:\n\n${lines.join("\n")}\n\nThank you for trusting us with your wardrobe! 🌸`;
  return `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(message)}`;
}
