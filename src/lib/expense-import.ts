export const IMPORT_FIELD_KEYS = ["date", "category", "amount", "payMethod", "description", "customerMobile", "customerName"] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportFieldKey, string> = {
  date: "Date",
  category: "Category",
  amount: "Amount",
  payMethod: "Paid through",
  description: "Notes",
  customerMobile: "Customer mobile",
  customerName: "Customer name",
};

export const IMPORT_REQUIRED_FIELDS: ImportFieldKey[] = ["category", "amount"];

/** null = column left unmapped (only valid for optional fields). */
export type ImportMapping = Record<ImportFieldKey, string | null>;

export function blankImportMapping(): ImportMapping {
  return {
    date: null,
    category: null,
    amount: null,
    payMethod: null,
    description: null,
    customerMobile: null,
    customerName: null,
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
  date: string;
  category: string;
  amount: number;
  payMethod: string;
  description: string;
  customerMobile: string;
  customerName: string;
}
