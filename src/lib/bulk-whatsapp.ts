import { normalizeIndianMobile } from "@/lib/business-rules";

/**
 * No-API bulk WhatsApp: wa.me's click-to-chat link only ever pre-fills TEXT (see
 * BulkWhatsAppDialog's own comment) — there is no URL parameter or public mechanism to
 * pre-attach an image on WhatsApp Web or the mobile app. So this only ever automates the text
 * half; the image is uploaded once, previewed/downloadable, and attached manually inside each
 * opened chat — same one-real-click-per-recipient shape as the existing order reminders, just
 * for a free-form customer list instead of orders matching one type.
 */

const NAME_TOKEN_RE = /\{name\}/gi;

export function applyNameTemplate(template: string, name: string): string {
  return template.replace(NAME_TOKEN_RE, name || "there");
}

export function buildBulkWhatsAppUrl(mobile: string, name: string, template: string): string {
  const message = applyNameTemplate(template, name);
  return `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(message)}`;
}
