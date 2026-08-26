export const IMPORT_FIELD_KEYS = [
  "customerMobile",
  "customerName",
  "garmentType",
  "deliveryDate",
  "total",
  "advance",
  "tailor",
  "notes",
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportFieldKey, string> = {
  customerMobile: "Customer mobile",
  customerName: "Customer name",
  garmentType: "Garment type",
  deliveryDate: "Delivery date",
  total: "Total",
  advance: "Advance",
  tailor: "Tailor",
  notes: "Notes",
};

export const IMPORT_REQUIRED_FIELDS: ImportFieldKey[] = ["customerMobile", "customerName", "garmentType", "total"];

/** null = column left unmapped (only valid for optional fields). */
export type ImportMapping = Record<ImportFieldKey, string | null>;

export function blankImportMapping(): ImportMapping {
  return {
    customerMobile: null,
    customerName: null,
    garmentType: null,
    deliveryDate: null,
    total: null,
    advance: null,
    tailor: null,
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
  garmentType: string;
  deliveryDate: string;
  total: number;
  advance: number;
  /** Resolved employee id if the CSV's tailor name matched exactly one active employee,
   *  otherwise the raw text is kept (see order-import-wizard.tsx's resolveTailor()) so it still
   *  round-trips into orders.tailor as free text for manual reassignment later, same as before
   *  this resolution step existed. */
  tailor: string;
  /** True when `tailor` above is the raw, unresolved CSV text (no unique employee match) —
   *  shown as a warning badge (not a hard error) so the row still imports. */
  tailorUnresolved: boolean;
  notes: string;
}
