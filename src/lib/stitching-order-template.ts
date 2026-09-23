// Same shape/conventions as src/lib/invoice-template.ts, applied to the stitching-order customer
// receipt PDF (src/lib/pdf/stitching-order-document.tsx) instead of a Product Sales invoice.
// Kept as its own file/setting key ("stitchingOrderTemplates") rather than reusing
// InvoiceTemplateConfig — the field-visibility toggles are genuinely different (garments/
// measurements/tailor, no GST/discount/shipping breakdown).

export type StitchingTemplateFont = "Helvetica" | "Times-Roman" | "Courier";
export type StitchingPaperSize = "A4" | "Letter";
export type StitchingOrientation = "portrait" | "landscape";

export interface StitchingOrderTemplateConfig {
  id: string;
  name: string;
  colorTheme: string;
  paperSize: StitchingPaperSize;
  orientation: StitchingOrientation;
  margin: number;
  font: StitchingTemplateFont;
  logoWidth: number;
  shopNameFontSize: number;
  titleFontSize: number;
  customerNameFontSize: number;
  orderNumberFontSize: number;
  boldShopName: boolean;
  boldCustomerName: boolean;
  showGarmentsTable: boolean;
  showMeasurements: boolean;
  showSpecialInstructions: boolean;
  showTailorName: boolean;
  showPaymentSummary: boolean;
  showAmountInWords: boolean;
  showPageNumbers: boolean;
  showQrCode: boolean;
  showLogo: boolean;
  showSignature: boolean;
  showBankDetails: boolean;
  showTerms: boolean;
  logoDataUrl: string | null;
  qrCodeDataUrl: string | null;
  signatureDataUrl: string | null;
  bankDetails: string;
  terms: string;
}

export interface StitchingOrderTemplatesSetting {
  templates: StitchingOrderTemplateConfig[];
  defaultId: string;
}

export function blankStitchingOrderTemplate(name = "Default"): StitchingOrderTemplateConfig {
  return {
    id: `sot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    colorTheme: "#6D28D9",
    paperSize: "A4",
    orientation: "portrait",
    margin: 32,
    font: "Helvetica",
    logoWidth: 64,
    shopNameFontSize: 16,
    titleFontSize: 18,
    customerNameFontSize: 11,
    orderNumberFontSize: 10,
    boldShopName: true,
    boldCustomerName: true,
    showGarmentsTable: true,
    showMeasurements: false,
    showSpecialInstructions: true,
    showTailorName: false,
    showPaymentSummary: true,
    showAmountInWords: true,
    showPageNumbers: true,
    showQrCode: false,
    showLogo: false,
    showSignature: false,
    showBankDetails: false,
    showTerms: false,
    logoDataUrl: null,
    qrCodeDataUrl: null,
    signatureDataUrl: null,
    bankDetails: "",
    terms: "",
  };
}

export const DEFAULT_STITCHING_ORDER_TEMPLATES_SETTING: StitchingOrderTemplatesSetting = {
  templates: [blankStitchingOrderTemplate()],
  defaultId: "sot-default",
};
DEFAULT_STITCHING_ORDER_TEMPLATES_SETTING.templates[0].id = "sot-default";

export function getDefaultStitchingOrderTemplate(setting: StitchingOrderTemplatesSetting): StitchingOrderTemplateConfig {
  return setting.templates.find((t) => t.id === setting.defaultId) || setting.templates[0] || blankStitchingOrderTemplate();
}

/** Backfills any field missing from a saved template — same reasoning as hydrateInvoiceTemplate. */
export function hydrateStitchingOrderTemplate(t: Partial<StitchingOrderTemplateConfig> & { id: string; name: string }): StitchingOrderTemplateConfig {
  return { ...blankStitchingOrderTemplate(t.name), ...t };
}
