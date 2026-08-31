// Editable WhatsApp templates for stitching orders — mirrors sales-whatsapp.ts. Previously
// hardcoded in business-rules.ts; now stored in app_settings and editable from Settings so a
// shop can customize wording, same as Sales WhatsApp templates.
import type { WhatsAppMessageType } from "@/lib/business-rules";

export type StitchingWhatsAppTemplates = Record<WhatsAppMessageType, string>;

export const DEFAULT_STITCHING_WHATSAPP_TEMPLATES: StitchingWhatsAppTemplates = {
  received: "Dear *{name}*🙏\n\nYour Stitching Order *{order_id}* Received at *{shop_name}* Boutique.\n🗓️ Delivery Date is: *{delivery_date}*\n We will notify you when Ready! Thanks.🌸\n📞 {shop_phone}{website_line}",
  ready: "Dear *{name}*✅\n\nYour Stitching Order *{order_id}* is *READY!* 🎉\n{garments}. Please Collect soon !.{balance_line}\n📞 *{shop_phone}*\n_{shop_name}_ 🌸",
  overdue: "Dear *{name}* 🙏\n\nYour Stitching Order *{order_id}* was due on *{delivery_date}* and is still in progress.\nWe sincerely apologize for the delay. We will notify you as soon as it is Ready! 🙏\n📞 {shop_phone}\n_{shop_name}_{website_line}",
  delivered: "Dear *{name}*💐\n Thank you for collecting your garments from *{shop_name}!* 😍{review_line}{website_line}",
  payment: "Dear *{name}*🙏\nPayment of *₹{balance}* received. Thank you! 💚\n_{shop_name}_ ✂️{website_line}",
  paymentDue: "Dear *{name}* 🙏\n\n₹{balance} is due against your stitching order *{order_id}*.\nPlease clear at your earliest convenience.\n📞 {shop_phone}\n_{shop_name}_",
};

export const STITCHING_WHATSAPP_LABELS: Record<WhatsAppMessageType, string> = {
  received: "Order received",
  ready: "Order ready",
  overdue: "Order overdue",
  delivered: "Order delivered",
  payment: "Payment received",
  paymentDue: "Payment due",
};

export const STITCHING_WHATSAPP_VARIABLES = [
  "{name}",
  "{order_id}",
  "{delivery_date}",
  "{garments}",
  "{balance}",
  "{shop_name}",
  "{shop_phone}",
  "{website_line}",
  "{review_line}",
  "{balance_line}",
];
