export const IMPORT_FIELD_KEYS = [
  "customerMobile",
  "customerName",
  "invoiceDate",
  "product",
  "qty",
  "unitPrice",
  "discountPercent",
  "notes",
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportFieldKey, string> = {
  customerMobile: "Customer mobile",
  customerName: "Customer name",
  invoiceDate: "Invoice date",
  product: "Product (name or SKU)",
  qty: "Quantity",
  unitPrice: "Unit price",
  discountPercent: "Discount %",
  notes: "Notes",
};

export const IMPORT_REQUIRED_FIELDS: ImportFieldKey[] = ["customerMobile", "product", "qty"];

/** null = column left unmapped (only valid for optional fields). */
export type ImportMapping = Record<ImportFieldKey, string | null>;

export function blankImportMapping(): ImportMapping {
  return {
    customerMobile: null,
    customerName: null,
    invoiceDate: null,
    product: null,
    qty: null,
    unitPrice: null,
    discountPercent: null,
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
  customerMobile: string;
  customerName: string;
  invoiceDate: string;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  notes: string;
}
