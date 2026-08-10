export type InvoiceTemplateFont = "Helvetica" | "Times-Roman" | "Courier";
export type InvoicePaperSize = "A4" | "Letter";
export type InvoiceOrientation = "portrait" | "landscape";

export interface InvoiceTemplateConfig {
  id: string;
  name: string;
  colorTheme: string;
  paperSize: InvoicePaperSize;
  orientation: InvoiceOrientation;
  margin: number;
  font: InvoiceTemplateFont;
  logoWidth: number;
  shopNameFontSize: number;
  invoiceTitleFontSize: number;
  customerNameFontSize: number;
  invoiceNumberFontSize: number;
  boldShopName: boolean;
  boldCustomerName: boolean;
  showSubtotal: boolean;
  showTax: boolean;
  showShipping: boolean;
  showDiscount: boolean;
  showAmountInWords: boolean;
  showPageNumbers: boolean;
  showQrCode: boolean;
  showLogo: boolean;
  showSignature: boolean;
  showBankDetails: boolean;
  logoDataUrl: string | null;
  qrCodeDataUrl: string | null;
  signatureDataUrl: string | null;
  bankDetails: string;
}

export interface InvoiceTemplatesSetting {
  templates: InvoiceTemplateConfig[];
  defaultId: string;
}

export function blankInvoiceTemplate(name = "Default"): InvoiceTemplateConfig {
  return {
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    colorTheme: "#6D28D9",
    paperSize: "A4",
    orientation: "portrait",
    margin: 32,
    font: "Helvetica",
    logoWidth: 64,
    shopNameFontSize: 16,
    invoiceTitleFontSize: 18,
    customerNameFontSize: 11,
    invoiceNumberFontSize: 10,
    boldShopName: true,
    boldCustomerName: true,
    showSubtotal: true,
    showTax: true,
    showShipping: true,
    showDiscount: true,
    showAmountInWords: true,
    showPageNumbers: true,
    showQrCode: false,
    showLogo: false,
    showSignature: false,
    showBankDetails: false,
    logoDataUrl: null,
    qrCodeDataUrl: null,
    signatureDataUrl: null,
    bankDetails: "",
  };
}

export const DEFAULT_INVOICE_TEMPLATES_SETTING: InvoiceTemplatesSetting = {
  templates: [blankInvoiceTemplate()],
  defaultId: "tpl-default",
};

// The one and only built-in default keeps a stable id so a fresh shop always has a valid defaultId.
DEFAULT_INVOICE_TEMPLATES_SETTING.templates[0].id = "tpl-default";

export function getDefaultTemplate(setting: InvoiceTemplatesSetting): InvoiceTemplateConfig {
  return setting.templates.find((t) => t.id === setting.defaultId) || setting.templates[0] || blankInvoiceTemplate();
}
