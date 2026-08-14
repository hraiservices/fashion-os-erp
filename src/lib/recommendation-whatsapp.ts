import { normalizeIndianMobile } from "@/lib/business-rules";

/** Editable in Settings, same pattern as sales-whatsapp.ts. One template, since a product
 *  recommendation only ever needs one shape of message (unlike invoice/reminder/receipt). */
export const DEFAULT_RECOMMENDATION_TEMPLATE =
  "Hi {name} 👋\n\nYou've bought similar {category} from us before. New stock just arrived — thought you might like this:\n\n*{product_name}*\n₹{price}\n\nWant me to share more photos?";

export const RECOMMENDATION_TEMPLATE_VARIABLES = ["{name}", "{product_name}", "{category}", "{price}"];

export interface RecommendationContext {
  customerName: string;
  productName: string;
  category: string;
  price: number;
}

export function renderRecommendationMessage(template: string, ctx: RecommendationContext): string {
  return template
    .replaceAll("{name}", ctx.customerName || "")
    .replaceAll("{product_name}", ctx.productName || "")
    .replaceAll("{category}", ctx.category || "")
    .replaceAll("{price}", String(ctx.price ?? ""));
}

export function buildRecommendationWaUrl(mobile: string, template: string, ctx: RecommendationContext): string {
  const cleanMobile = normalizeIndianMobile(mobile);
  const message = renderRecommendationMessage(template, ctx);
  return `https://wa.me/91${cleanMobile}?text=${encodeURIComponent(message)}`;
}
