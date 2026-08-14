import type { Product, SalesInvoice, Customer } from "@/lib/types";
import { computeBuyingProfile } from "@/lib/customer-buying-profile";

export interface MatchResult {
  score: number;
  /** Human-readable reasons, most significant first — shown directly in the UI so the
   *  scoring is never a black box (per the "transparent rule-based" requirement). */
  reasons: string[];
}

const WEIGHTS = {
  categoryMatch: 35,
  colorMatch: 15,
  sizeMatch: 15,
  fabricMatch: 15,
  occasionMatch: 8,
  dueForRepurchase: 12,
  priceRangeFit: 8,
  alreadyOwnsExact: -60,
};

/**
 * Rule-based, transparent scoring — deliberately not ML. Weights live in one place (WEIGHTS
 * above) so they're easy to tune without touching the scoring logic itself. Score is clamped
 * to [0, 100]; callers typically only show matches above some threshold (e.g. 40).
 */
export function scoreProductForCustomer(
  product: Product,
  profile: ReturnType<typeof computeBuyingProfile>,
  purchasedProductIds: Set<string>
): MatchResult {
  let score = 0;
  const reasons: string[] = [];

  if (purchasedProductIds.has(product.id)) {
    score += WEIGHTS.alreadyOwnsExact;
    reasons.push("Already purchased this exact product");
  }

  const topCategory = profile.topCategories.find((c) => c.category === product.category);
  if (topCategory) {
    // Scale slightly by how dominant this category is in their history (30-100% -> full weight range).
    score += WEIGHTS.categoryMatch * Math.min(1, 0.5 + topCategory.percent / 100);
    reasons.push(`Bought ${product.category} before (${topCategory.percent}% of their purchases)`);
  }

  if (product.color && profile.preferredColors.some((c) => c.value === product.color)) {
    score += WEIGHTS.colorMatch;
    reasons.push(`Prefers ${product.color}`);
  }
  if (product.size && profile.preferredSizes.some((s) => s.value === product.size)) {
    score += WEIGHTS.sizeMatch;
    reasons.push(`Usual size (${product.size})`);
  }
  if (product.fabric && profile.preferredFabrics.some((f) => f.value === product.fabric)) {
    score += WEIGHTS.fabricMatch;
    reasons.push(`Prefers ${product.fabric}`);
  }
  if (product.occasion && topCategory) {
    // Occasion match only counts alongside a category match — an occasion tag alone is too weak a signal.
    score += WEIGHTS.occasionMatch;
    reasons.push(`Matches ${product.occasion} shopping pattern`);
  }

  if (profile.purchaseCycleDays != null && profile.lastPurchaseDate) {
    const daysSinceLastPurchase = (Date.now() - new Date(profile.lastPurchaseDate).getTime()) / 86_400_000;
    if (daysSinceLastPurchase >= profile.purchaseCycleDays * 0.8) {
      score += WEIGHTS.dueForRepurchase;
      reasons.push(`Due for a repeat purchase (~${Math.round(daysSinceLastPurchase)} days since last)`);
    }
  }

  if (profile.averageOrderValue > 0) {
    const ratio = product.sellingPrice / profile.averageOrderValue;
    if (ratio >= 0.5 && ratio <= 2) {
      score += WEIGHTS.priceRangeFit;
      reasons.push("Within their usual price range");
    }
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export interface CustomerMatch {
  customer: Customer;
  score: number;
  reasons: string[];
}

/** Ranked list of customers likely to want this product, highest score first. Customers with
 *  zero retail purchase history score 0 and are excluded (nothing to match against yet). */
export function matchCustomersForProduct(
  product: Product,
  customers: Customer[],
  invoicesByMobile: Map<string, SalesInvoice[]>,
  productsById: Map<string, Product>,
  minScore = 30
): CustomerMatch[] {
  const results: CustomerMatch[] = [];
  for (const customer of customers) {
    const custInvoices = invoicesByMobile.get(customer.mobile) || [];
    if (custInvoices.length === 0) continue;
    const profile = computeBuyingProfile(custInvoices, productsById);
    const purchasedIds = new Set(custInvoices.flatMap((inv) => inv.items.map((it) => it.productId)));
    const { score, reasons } = scoreProductForCustomer(product, profile, purchasedIds);
    if (score >= minScore) results.push({ customer, score, reasons });
  }
  return results.sort((a, b) => b.score - a.score);
}

export interface ProductMatch {
  product: Product;
  score: number;
  reasons: string[];
}

/** Ranked list of in-stock products likely to interest this customer, highest score first. */
export function matchProductsForCustomer(
  custInvoices: SalesInvoice[],
  products: Product[],
  productsById: Map<string, Product>,
  minScore = 30
): ProductMatch[] {
  if (custInvoices.length === 0) return [];
  const profile = computeBuyingProfile(custInvoices, productsById);
  const purchasedIds = new Set(custInvoices.flatMap((inv) => inv.items.map((it) => it.productId)));
  const results: ProductMatch[] = [];
  for (const product of products) {
    if (product.stockQty <= 0) continue;
    const { score, reasons } = scoreProductForCustomer(product, profile, purchasedIds);
    if (score >= minScore) results.push({ product, score, reasons });
  }
  return results.sort((a, b) => b.score - a.score);
}

/** Groups invoices by customer mobile — shared prep step for matchCustomersForProduct callers
 *  that need to score against many customers at once (avoids recomputing the filter per call). */
export function groupInvoicesByMobile(invoices: SalesInvoice[]): Map<string, SalesInvoice[]> {
  const map = new Map<string, SalesInvoice[]>();
  for (const inv of invoices) {
    const list = map.get(inv.customerMobile);
    if (list) list.push(inv);
    else map.set(inv.customerMobile, [inv]);
  }
  return map;
}
