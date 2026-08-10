// Editable WhatsApp templates for Sales — unlike the stitching-order templates (hardcoded
// in business-rules.ts), these are stored in app_settings and editable from Settings, per
// the decision to let the shop customize sales messaging wording.
import { normalizeIndianMobile } from "@/lib/business-rules";

export type SalesWhatsAppType = "invoiceSent" | "paymentReminder" | "paymentReceived" | "sendPdfLink";

export interface SalesWhatsAppTemplates {
  invoiceSent: string;
  paymentReminder: string;
  paymentReceived: string;
  sendPdfLink: string;
}

export const DEFAULT_SALES_WHATSAPP_TEMPLATES: SalesWhatsAppTemplates = {
  invoiceSent: "Dear {name}🙏\n\nYour invoice *{invoice_no}* for *₹{total}* is ready.\nDue date: {due_date}\n📞 {shop_phone}\n_{shop_name}_",
  paymentReminder: "Dear {name} 🙏\n\n₹{balance} is due against invoice *{invoice_no}*.\nPlease clear at your earliest convenience.\n📞 {shop_phone}\n_{shop_name}_",
  paymentReceived: "Dear {name}💚\n\nPayment of *₹{amount}* received for invoice *{invoice_no}*. Thank you!\n_{shop_name}_ ✂️",
  sendPdfLink: "Dear {name} 🙏\n\nHere is your invoice *{invoice_no}* for *₹{total}*.\n📄 View & download PDF: {invoice_link}\n📞 {shop_phone}\n_{shop_name}_",
};

export const SALES_WHATSAPP_LABELS: Record<SalesWhatsAppType, string> = {
  invoiceSent: "Invoice sent",
  paymentReminder: "Payment reminder",
  paymentReceived: "Payment received",
  sendPdfLink: "Send PDF link",
};

export const SALES_WHATSAPP_VARIABLES = ["{name}", "{invoice_no}", "{total}", "{balance}", "{amount}", "{due_date}", "{shop_name}", "{shop_phone}", "{invoice_link}"];

export interface SalesWhatsAppContext {
  name: string;
  invoiceNo: string;
  total?: number;
  balance?: number;
  amount?: number;
  dueDate?: string | null;
  shopName?: string;
  shopPhone?: string;
  invoiceLink?: string;
}

function fmtDateIN(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function renderSalesWhatsAppMessage(template: string, ctx: SalesWhatsAppContext): string {
  return template
    .replaceAll("{name}", ctx.name || "")
    .replaceAll("{invoice_no}", ctx.invoiceNo || "")
    .replaceAll("{total}", String(ctx.total ?? ""))
    .replaceAll("{balance}", String(ctx.balance ?? ""))
    .replaceAll("{amount}", String(ctx.amount ?? ""))
    .replaceAll("{due_date}", fmtDateIN(ctx.dueDate))
    .replaceAll("{shop_name}", ctx.shopName || "")
    .replaceAll("{shop_phone}", ctx.shopPhone || "")
    .replaceAll("{invoice_link}", ctx.invoiceLink || "");
}

export function buildSalesWhatsAppUrl(mobile: string, template: string, ctx: SalesWhatsAppContext): string {
  const cleanMobile = normalizeIndianMobile(mobile);
  const message = renderSalesWhatsAppMessage(template, ctx);
  return `https://wa.me/91${cleanMobile}?text=${encodeURIComponent(message)}`;
}
