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
  /** Separate approved template for the daily briefing push (src/app/api/ai/daily-briefing) —
   *  a proactive, shop-initiated message needs its own template just like the recommendation
   *  send does; the briefing text doesn't fit that template's 3-parameter shape. Must have
   *  exactly one {{1}} body parameter, which receives the (possibly truncated) briefing text. */
  briefingTemplateName?: string;
  /** Approved template for the "ready for pickup" nudge (src/app/api/orders/[id]/advance-stage)
   *  — sent automatically the moment an order reaches "ready." Must have exactly 3 {{n}} body
   *  parameters in order: customer name, order id, balance due. */
  readyTemplateName?: string;
  /** Approved template for the automated payment-reminder cron (src/app/api/whatsapp/
   *  payment-reminders). Must have exactly 2 {{n}} body parameters in order: customer name,
   *  amount due. */
  paymentReminderTemplateName?: string;
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

interface WhatsAppApiSuccess {
  messages?: { id?: string }[];
}

/** Meta's wamid for the just-sent message, or null if the response didn't have the shape
 *  expected — logged as a send with no trackable id rather than treated as a failure, since
 *  the send itself already succeeded (res.ok) by the time this is called. */
async function extractMessageId(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => ({}))) as WhatsAppApiSuccess;
  return body.messages?.[0]?.id ?? null;
}

/** Throws on failure — callers should catch and fall back to the wa.me flow. Resolves to
 *  Meta's message id (wamid) on success, for the caller to log against whatsapp_message_log. */
export async function sendWhatsAppTemplateMessage({ config, toMobile, customerName, productName, price, imageUrl }: SendTemplateInput): Promise<string | null> {
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
  return extractMessageId(res);
}

/** Meta template body parameters are capped at 1024 characters each — truncate rather than let
 *  the send fail outright for a long briefing. */
const TEMPLATE_BODY_PARAM_MAX = 1000;

/**
 * Sends a template message with arbitrary {{1}}, {{2}}, ... body parameters — a more general
 * sibling of sendWhatsAppTemplateMessage (which is hardcoded to the 3-parameter recommendation
 * template + an optional image header). Used by the daily-briefing push (1 param: the briefing
 * text) and the "ready for pickup" nudge (customer name + order id + balance due), and reusable
 * for any future proactive (shop-initiated, outside the 24-hour customer-service window)
 * text-only template.
 */
export async function sendWhatsAppTemplateText(
  config: Pick<WhatsAppCloudApiConfig, "phoneNumberId" | "accessToken">,
  toMobile: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[]
): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toMobile,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text: text.slice(0, TEMPLATE_BODY_PARAM_MAX) })) }],
      },
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as WhatsAppApiError;
    throw new Error(body.error?.message || `WhatsApp Cloud API error (${res.status})`);
  }
  return extractMessageId(res);
}

/**
 * Sends a freeform text reply — only allowed by Meta within the 24-hour customer-service
 * window after the customer's own last inbound message (unlike sendWhatsAppTemplateMessage,
 * this never needs a pre-approved template). Used by the order-status concierge webhook
 * (src/app/api/webhooks/whatsapp/route.ts) to reply to a customer who just texted in — never
 * for an outbound message the shop initiates, which still needs a template.
 */
export async function sendWhatsAppTextMessage(config: Pick<WhatsAppCloudApiConfig, "phoneNumberId" | "accessToken">, toMobile: string, text: string): Promise<string | null> {
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
  return extractMessageId(res);
}
