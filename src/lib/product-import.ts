export const IMPORT_FIELD_KEYS = [
  "name",
  "sku",
  "category",
  "sellingPrice",
  "costPrice",
  "taxRate",
  "lowStockAlert",
  "openingStock",
  "notes",
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportFieldKey, string> = {
  name: "Product name",
  sku: "SKU",
  category: "Category",
  sellingPrice: "Selling price",
  costPrice: "Cost price",
  taxRate: "Tax rate %",
  lowStockAlert: "Low stock alert",
  openingStock: "Opening stock",
  notes: "Notes",
};

export const IMPORT_REQUIRED_FIELDS: ImportFieldKey[] = ["name", "sku", "sellingPrice"];

/** null = column left unmapped (only valid for optional fields). */
export type ImportMapping = Record<ImportFieldKey, string | null>;

export function blankImportMapping(): ImportMapping {
  return {
    name: null,
    sku: null,
    category: null,
    sellingPrice: null,
    costPrice: null,
    taxRate: null,
    lowStockAlert: null,
    openingStock: null,
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
  name: string;
  sku: string;
  category: string;
  sellingPrice: number;
  costPrice: number;
  taxRate: number;
  lowStockAlert: number;
  openingStock: number;
  notes: string;
}
