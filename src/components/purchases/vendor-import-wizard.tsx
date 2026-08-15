"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle2, XCircle, Save } from "lucide-react";
import { useVendors } from "@/hooks/use-vendors";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSaveVendor } from "@/hooks/use-purchase-mutations";
import { parseDelimitedText, type ParsedTable } from "@/lib/csv-parse";
import {
  VENDOR_IMPORT_FIELD_KEYS,
  VENDOR_IMPORT_FIELD_LABELS,
  VENDOR_IMPORT_REQUIRED_FIELDS,
  blankVendorImportMapping,
  DEFAULT_VENDOR_IMPORT_MAPPING_PRESETS,
  type VendorImportFieldKey,
  type VendorImportMapping,
  type VendorImportMappingPreset,
  type VendorImportMappingPresetsSetting,
  type VendorImportRowResult,
} from "@/lib/vendor-import";
import type { Vendor } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const UNMAPPED = "__unmapped__";

function validateRows(table: ParsedTable, mapping: VendorImportMapping, existingVendors: Vendor[]): VendorImportRowResult[] {
  const colIndex = (field: VendorImportFieldKey) => {
    const header = mapping[field];
    return header ? table.headers.indexOf(header) : -1;
  };
  const idx = Object.fromEntries(VENDOR_IMPORT_FIELD_KEYS.map((f) => [f, colIndex(f)])) as Record<VendorImportFieldKey, number>;

  const existingMobiles = new Set(existingVendors.map((v) => v.mobile.trim()));
  const seenMobiles = new Set<string>();

  return table.rows.map((row, rowIndex) => {
    const get = (f: VendorImportFieldKey) => (idx[f] >= 0 ? (row[idx[f]] || "").trim() : "");

    const name = get("name");
    const mobile = get("mobile");

    let error: string | undefined;
    if (!name) error = "Missing vendor name";
    else if (!mobile) error = "Missing mobile";
    else if (existingMobiles.has(mobile)) error = `Vendor with mobile ${mobile} already exists`;
    else if (seenMobiles.has(mobile)) error = `Duplicate mobile ${mobile} in file`;

    if (mobile) seenMobiles.add(mobile);

    return {
      rowIndex,
      ok: !error,
      error,
      name,
      mobile,
      email: get("email"),
      gstin: get("gstin"),
      state: get("state"),
      address: get("address"),
      notes: get("notes"),
    };
  });
}

export function VendorImportWizard() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: existingVendors } = useVendors();
  const { data: presetsSetting, save: savePresets } = useAppSetting<VendorImportMappingPresetsSetting>(
    "vendorImportPresets",
    DEFAULT_VENDOR_IMPORT_MAPPING_PRESETS
  );
  const saveVendor = useSaveVendor();

  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<VendorImportMapping>(blankVendorImportMapping());
  const [results, setResults] = useState<VendorImportRowResult[] | null>(null);
  const [presetName, setPresetName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseDelimitedText(String(reader.result || ""));
      if (parsed.rows.length === 0) {
        toast.error("No data rows found in file");
        return;
      }
      setTable(parsed);
      setResults(null);
      setMapping(blankVendorImportMapping());
    };
    reader.onerror = () => toast.error("Could not read file");
    reader.readAsText(file);
  }

  function applyPreset(id: string) {
    const preset = (presetsSetting?.presets || []).find((p) => p.id === id);
    if (preset) setMapping(preset.mapping);
  }

  async function saveAsPreset() {
    const name = presetName.trim();
    if (!name) return;
    const preset: VendorImportMappingPreset = { id: `preset-${Date.now()}`, name, mapping };
    try {
      await savePresets.mutateAsync({ presets: [...(presetsSetting?.presets || []), preset] });
      setPresetName("");
      toast.success("Mapping preset saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save preset");
    }
  }

  function runValidation() {
    if (!table) return;
    const missingRequired = VENDOR_IMPORT_REQUIRED_FIELDS.filter((f) => !mapping[f]);
    if (missingRequired.length) {
      toast.error(`Map required fields: ${missingRequired.map((f) => VENDOR_IMPORT_FIELD_LABELS[f]).join(", ")}`);
      return;
    }
    setResults(validateRows(table, mapping, existingVendors || []));
  }

  async function runImport() {
    if (!results) return;
    const validRows = results.filter((r) => r.ok);
    if (validRows.length === 0) return;
    setImporting(true);
    setImportedCount(0);
    let failed = 0;

    for (const row of validRows) {
      try {
        await saveVendor.mutateAsync({
          name: row.name,
          mobile: row.mobile,
          email: row.email,
          gstin: row.gstin,
          state: row.state,
          address: row.address,
          notes: row.notes,
          userEmail: user?.email,
        });
        setImportedCount((c) => c + 1);
      } catch {
        failed++;
      }
    }

    setImporting(false);
    if (failed) toast.error(`Imported ${validRows.length - failed} vendors, ${failed} failed`);
    else toast.success(`Imported ${validRows.length} vendors`);
    if (validRows.length - failed > 0) router.push("/purchases/vendors");
  }

  const validCount = results?.filter((r) => r.ok).length || 0;
  const invalidCount = results ? results.length - validCount : 0;

  return (
    <div className="space-y-5">
      {!table ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Upload className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="mb-3 text-sm text-muted-foreground">Upload a CSV or TSV file — one row per vendor.</p>
          <Button nativeButton={false} render={<label className="cursor-pointer" />}>
            Choose file
            <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFile} />
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-xl border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Column mapping</p>
              <div className="flex items-center gap-2">
                {(presetsSetting?.presets || []).length > 0 && (
                  <Select onValueChange={(v) => v && applyPreset(v as string)}>
                    <SelectTrigger className="h-8 w-40">
                      <SelectValue placeholder="Load preset…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(presetsSetting?.presets || []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Input placeholder="Preset name" className="h-8 w-32" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
                <Button variant="outline" size="sm" onClick={saveAsPreset} disabled={!presetName.trim() || savePresets.isPending}>
                  <Save className="size-3.5" /> Save preset
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {VENDOR_IMPORT_FIELD_KEYS.map((field) => (
                <div key={field} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {VENDOR_IMPORT_FIELD_LABELS[field]}
                    {VENDOR_IMPORT_REQUIRED_FIELDS.includes(field) && " *"}
                  </label>
                  <Select
                    value={mapping[field] || UNMAPPED}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v === UNMAPPED ? null : v }))}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNMAPPED}>Not mapped</SelectItem>
                      {table.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button onClick={runValidation}>Validate {table.rows.length} rows</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTable(null);
                  setResults(null);
                }}
              >
                Choose a different file
              </Button>
            </div>
          </div>

          {results && (
            <div className="rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">
                  <span className="text-emerald-600 dark:text-emerald-400">{validCount} valid</span>
                  {invalidCount > 0 && <span className="text-destructive"> · {invalidCount} invalid</span>}
                </p>
                <Button onClick={runImport} disabled={validCount === 0 || importing}>
                  {importing ? `Importing… (${importedCount}/${validCount})` : `Import ${validCount} vendors`}
                </Button>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>GSTIN</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r) => (
                      <TableRow key={r.rowIndex}>
                        <TableCell className="text-muted-foreground">{r.rowIndex + 1}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.mobile}</TableCell>
                        <TableCell>{r.gstin}</TableCell>
                        <TableCell>
                          {r.ok ? (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle2 className="size-3" /> OK
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="size-3" /> {r.error}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
