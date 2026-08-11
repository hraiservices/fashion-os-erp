export const VENDOR_IMPORT_FIELD_KEYS = ["name", "mobile", "email", "gstin", "state", "address", "notes"] as const;

export type VendorImportFieldKey = (typeof VENDOR_IMPORT_FIELD_KEYS)[number];

export const VENDOR_IMPORT_FIELD_LABELS: Record<VendorImportFieldKey, string> = {
  name: "Vendor name",
  mobile: "Mobile",
  email: "Email",
  gstin: "GSTIN",
  state: "State",
  address: "Address",
  notes: "Notes",
};

export const VENDOR_IMPORT_REQUIRED_FIELDS: VendorImportFieldKey[] = ["name", "mobile"];

/** null = column left unmapped (only valid for optional fields). */
export type VendorImportMapping = Record<VendorImportFieldKey, string | null>;

export function blankVendorImportMapping(): VendorImportMapping {
  return {
    name: null,
    mobile: null,
    email: null,
    gstin: null,
    state: null,
    address: null,
    notes: null,
  };
}

export interface VendorImportMappingPreset {
  id: string;
  name: string;
  mapping: VendorImportMapping;
}

export interface VendorImportMappingPresetsSetting {
  presets: VendorImportMappingPreset[];
}

export const DEFAULT_VENDOR_IMPORT_MAPPING_PRESETS: VendorImportMappingPresetsSetting = { presets: [] };

export interface VendorImportRowResult {
  rowIndex: number;
  ok: boolean;
  error?: string;
  name: string;
  mobile: string;
  email: string;
  gstin: string;
  state: string;
  address: string;
  notes: string;
}
