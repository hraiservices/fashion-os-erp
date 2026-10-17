/** WhatsApp message starters for a lead. The shop can edit these in Settings; until then the defaults below are used. */

export interface LeadTemplate {
  id: string;
  label: string;
  text: string;
}

export const LEAD_TEMPLATE_SETTING_KEY = "leadWhatsappTemplates";

/** {name} is the lead's first name and {product} what they asked about — both are filled in when the message opens. */
export const DEFAULT_LEAD_TEMPLATES: LeadTemplate[] = [
  { id: "thanks", label: "Thanks for visiting", text: "Hi {name}, thank you for visiting us today! Let us know if you have any questions about {product}." },
  { id: "quote", label: "Sending the quote", text: "Hi {name}, here is the quote for {product} we discussed. Happy to adjust anything — just tell me what you'd like changed." },
  { id: "reminder", label: "Gentle reminder", text: "Hi {name}, just checking in about {product}. Would you like to go ahead, or shall I hold it for a few more days?" },
  { id: "ready", label: "Your outfit is ready", text: "Hi {name}, good news — your outfit is ready! When would you like to pick it up?" },
  { id: "visit", label: "Invite to visit", text: "Hi {name}, we'd love to show you {product} in person. When can you drop by the shop?" },
];

export const MAX_LEAD_TEMPLATES = 12;

/** Keeps only well-formed entries from a stored setting (anyone signed in could have written to it). Falls back to the defaults when nothing usable is left. */
export function cleanTemplates(raw: unknown): LeadTemplate[] {
  if (!Array.isArray(raw)) return DEFAULT_LEAD_TEMPLATES;
  const out: LeadTemplate[] = [];
  for (const item of raw) {
    const r = item as Partial<LeadTemplate> | null;
    const label = typeof r?.label === "string" ? r.label.trim().slice(0, 40) : "";
    const text = typeof r?.text === "string" ? r.text.trim().slice(0, 600) : "";
    if (!label || !text) continue;
    out.push({ id: typeof r?.id === "string" && r.id ? r.id.slice(0, 40) : `t${out.length + 1}`, label, text });
    if (out.length >= MAX_LEAD_TEMPLATES) break;
  }
  return out.length ? out : DEFAULT_LEAD_TEMPLATES;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "";

/** Fills {name} and {product}. A missing product reads naturally ("your enquiry") instead of leaving a hole. */
export function fillTemplate(text: string, lead: { name: string; productInterest?: string }): string {
  return text
    .replace(/\{name\}/gi, firstName(lead.name) || "there")
    .replace(/\{product\}/gi, lead.productInterest?.trim() || "your enquiry");
}
