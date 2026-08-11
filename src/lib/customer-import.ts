export const IMPORT_FIELD_KEYS = [
  "mobile",
  "name",
  "email",
  "address",
  "dob",
  "anniversary",
  "notes",
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportFieldKey, string> = {
  mobile: "Mobile",
  name: "Name",
  email: "Email",
  address: "Address",
  dob: "Date of birth",
  anniversary: "Anniversary",
  notes: "Notes",
};

export const IMPORT_REQUIRED_FIELDS: ImportFieldKey[] = ["mobile", "name"];

/** null = column left unmapped (only valid for optional fields). */
export type ImportMapping = Record<ImportFieldKey, string | null>;

export function blankImportMapping(): ImportMapping {
  return {
    mobile: null,
    name: null,
    email: null,
    address: null,
    dob: null,
    anniversary: null,
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
  mobile: string;
  name: string;
  email: string;
  address: string;
  dob: string;
  anniversary: string;
  notes: string;
}
