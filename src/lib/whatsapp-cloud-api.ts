/**
 * WhatsApp Business Cloud API (Meta) — the "real" send path from Section 6/10 of the feature
 * spec, as opposed to the wa.me click-to-chat fallback (recommendation-whatsapp.ts). Requires
 * credentials the shop owner must obtain from Meta Business Manager themselves — see
 * settings/recommendation-whatsapp-section.tsx for what to paste in. This module cannot be
 * exercised end-to-end without real credentials, so treat it as unverified until tested
 * against an actual WhatsApp Business Account.
 *
 * IMPORTANT — this sends a TEMPLATE message, not arbitrary text. Meta only allows freeform
 * text outside a 24-hour customer-service window if it uses a pre-approved message template.
 * A proactive "new stock might interest you" message is exactly the case that needs a
 * template: the shop owner must create one in Meta Business Manager (Business Manager >
 * WhatsApp Manager > Message Templates), get it approved, and enter its exact name/language
 * here. The template's body must have exactly 3 {{n}} parameters in this order: customer
 * name, product name, price — matching WHATSAPP_TEMPLATE_PARAM_ORDER below. If the template
 * has a different parameter count/order, sends will fail with a Meta API error.
 */

export const WHATSAPP_TEMPLATE_PARAM_ORDER = ["customer name", "product name", "price"] as const;

export interface WhatsAppCloudApiConfig {
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  languageCode: string;
  /** Meta App Secret — verifies the X-Hub-Signature-256 header on inbound webhook posts so a
   *  forged request can't be used to fish for order data or spoof a reply. Only needed for the
   *  order-status concierge below, not for outbound template sends. */
  appSecret?: string;
  /** Arbitrary string you also enter in Meta's webhook setup — proves the GET verification
   *  handshake is really Meta calling, not a guess. */
  verifyToken?: string;
  /** Master on/off switch for the inbound order-status concierge (src/app/api/webhooks/whatsapp) —
   *  kept separate from having credentials configured, so a shop already using the Cloud API for
   *  recommendation sends isn't opted into replying to inbound messages without asking. */
  conciergeEnabled?: boolean;
}

export function isCloudApiConfigured(config: Partial<WhatsAppCloudApiConfig> | null | undefined): config is WhatsAppCloudApiConfig {
  return !!(config?.phoneNumberId && config?.accessToken && config?.templateName && config?.languageCode);
}

interface SendTemplateInput {
  config: WhatsAppCloudApiConfig;
  /** E.164-ish digits, no "+" — e.g. "919876543210". */
  toMobile: string;
  customerName: string;
  productName: string;
  price: string;
  /** Public HTTPS URL — see app/api/products/[id]/image/route.ts. Omit to send a text-only template. */
  imageUrl?: string;
}

interface WhatsAppApiError {
  error?: { message?: string; type?: string; code?: number };
}

/** Throws on failure — callers should catch and fall back to the wa.me flow. */
export async function sendWhatsAppTemplateMessage({ config, toMobile, customerName, productName, price, imageUrl }: SendTemplateInput): Promise<void> {
  const components: unknown[] = [
    {
      type: "body",
      parameters: [
        { type: "text", text: customerName },
        { type: "text", text: productName },
        { type: "text", text: price },
      ],
    },
  ];
  if (imageUrl) {
    components.unshift({ type: "header", parameters: [{ type: "image", image: { link: imageUrl } }] });
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toMobile,
      type: "template",
      template: {
        name: config.templateName,
        language: { code: config.languageCode },
        components,
      },
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as WhatsAppApiError;
    throw new Error(body.error?.message || `WhatsApp Cloud API error (${res.status})`);
  }
}

/**
 * Sends a freeform text reply — only allowed by Meta within the 24-hour customer-service
 * window after the customer's own last inbound message (unlike sendWhatsAppTemplateMessage,
 * this never needs a pre-approved template). Used by the order-status concierge webhook
 * (src/app/api/webhooks/whatsapp/route.ts) to reply to a customer who just texted in — never
 * for an outbound message the shop initiates, which still needs a template.
 */
export async function sendWhatsAppTextMessage(config: Pick<WhatsAppCloudApiConfig, "phoneNumberId" | "accessToken">, toMobile: string, text: string): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toMobile,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as WhatsAppApiError;
    throw new Error(body.error?.message || `WhatsApp Cloud API error (${res.status})`);
  }
}
