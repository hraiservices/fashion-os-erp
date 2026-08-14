import type { Product, SalesInvoice } from "@/lib/types";
import { computeBuyingProfile } from "@/lib/customer-buying-profile";

export const SEGMENT_KEYS = ["high-value", "frequent", "due-for-repurchase", "inactive"] as const;
export type SegmentKey = (typeof SEGMENT_KEYS)[number] | `category:${string}`;

const HIGH_VALUE_SPEND = 10_000;
const FREQUENT_PURCHASE_COUNT = 5;
const INACTIVE_DAYS = 180;
/** A category must be at least this share of a customer's purchases to earn them a
 *  "<Category> Lovers" segment — otherwise every customer with one stray purchase qualifies. */
const CATEGORY_LOVER_SHARE = 40;

export interface CustomerSegment {
  key: SegmentKey;
  label: string;
}

/** Derived, not stored — computed fresh from live purchase data every time (see Phase 2's
 *  computeBuyingProfile). Cheap enough at ~500 customers to run in the browser on page load. */
export function computeSegments(invoices: SalesInvoice[], productsById: Map<string, Product>): CustomerSegment[] {
  if (invoices.length === 0) return [];
  const profile = computeBuyingProfile(invoices, productsById);
  const segments: CustomerSegment[] = [];

  if (profile.totalSpend >= HIGH_VALUE_SPEND) segments.push({ key: "high-value", label: "High-value" });
  if (profile.totalPurchases >= FREQUENT_PURCHASE_COUNT) segments.push({ key: "frequent", label: "Frequent buyer" });

  if (profile.purchaseCycleDays != null && profile.lastPurchaseDate) {
    const daysSince = (Date.now() - new Date(profile.lastPurchaseDate).getTime()) / 86_400_000;
    if (daysSince >= profile.purchaseCycleDays * 0.8) segments.push({ key: "due-for-repurchase", label: "Due for repurchase" });
  }

  if (profile.lastPurchaseDate) {
    const daysSince = (Date.now() - new Date(profile.lastPurchaseDate).getTime()) / 86_400_000;
    if (daysSince >= INACTIVE_DAYS) segments.push({ key: "inactive", label: "Inactive" });
  }

  const topCategory = profile.topCategories[0];
  if (topCategory && topCategory.percent >= CATEGORY_LOVER_SHARE) {
    segments.push({ key: `category:${topCategory.category}`, label: `${topCategory.category} Lover` });
  }

  return segments;
}
