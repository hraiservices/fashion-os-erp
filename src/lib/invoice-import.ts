export const IMPORT_FIELD_KEYS = [
  "invoiceNumber",
  "customerMobile",
  "customerName",
  "invoiceDate",
  "product",
  "qty",
  "unitPrice",
  "discountPercent",
  "paidAmount",
  "paymentMethod",
  "paymentDate",
  "notes",
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportFieldKey, string> = {
  invoiceNumber: "Invoice number (groups multi-line invoices)",
  customerMobile: "Customer mobile",
  customerName: "Customer name",
  invoiceDate: "Invoice date",
  product: "Product (name or SKU)",
  qty: "Quantity",
  unitPrice: "Unit price",
  discountPercent: "Discount %",
  paidAmount: "Amount already paid",
  paymentMethod: "Payment method",
  paymentDate: "Payment date",
  notes: "Notes",
};

export const IMPORT_REQUIRED_FIELDS: ImportFieldKey[] = ["customerMobile", "product", "qty"];

/** null = column left unmapped (only valid for optional fields). */
export type ImportMapping = Record<ImportFieldKey, string | null>;

export function blankImportMapping(): ImportMapping {
  return {
    invoiceNumber: null,
    customerMobile: null,
    customerName: null,
    invoiceDate: null,
    product: null,
    qty: null,
    unitPrice: null,
    discountPercent: null,
    paidAmount: null,
    paymentMethod: null,
    paymentDate: null,
    notes: null,
  };
}

export interface ImportMappingPreset {
  id: string;
  name: string;
  mapping: ImportMapping;
}

export interface ImportMappingPresetsSetting {
  presets: ImportMappingPreset[];
}

export const DEFAULT_IMPORT_MAPPING_PRESETS: ImportMappingPresetsSetting = { presets: [] };

export interface ImportRowResult {
  rowIndex: number;
  ok: boolean;
  error?: string;
  /** Raw value from the mapped column, "" if unmapped — rows sharing a non-empty value are
   *  grouped into one invoice with multiple line items. Rows with "" each become their own
   *  invoice (preserves the old one-row-per-invoice behavior when this column isn't mapped). */
  invoiceNumber: string;
  customerMobile: string;
  customerName: string;
  invoiceDate: string;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  /** Only meaningful on the first row of a group — see groupRows() in the wizard. */
  paidAmount: number;
  paymentMethod: string;
  paymentDate: string;
  notes: string;
}
