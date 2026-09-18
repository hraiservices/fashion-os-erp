"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle2, XCircle, Save } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useCreateExpense } from "@/hooks/use-expenses";
import { parseDelimitedText, type ParsedTable } from "@/lib/csv-parse";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import {
  IMPORT_FIELD_KEYS,
  IMPORT_FIELD_LABELS,
  IMPORT_REQUIRED_FIELDS,
  blankImportMapping,
  DEFAULT_IMPORT_MAPPING_PRESETS,
  type ImportFieldKey,
  type ImportMapping,
  type ImportMappingPreset,
  type ImportMappingPresetsSetting,
  type ImportRowResult,
} from "@/lib/expense-import";
import { istDateString } from "@/lib/ist-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const UNMAPPED = "__unmapped__";
const PAY_METHODS = ["Cash", "UPI", "Bank Transfer", "Card", "Cheque"];

function validateRows(table: ParsedTable, mapping: ImportMapping, categories: string[]): ImportRowResult[] {
  const colIndex = (field: ImportFieldKey) => {
    const header = mapping[field];
    return header ? table.headers.indexOf(header) : -1;
  };
  const idx = Object.fromEntries(IMPORT_FIELD_KEYS.map((f) => [f, colIndex(f)])) as Record<ImportFieldKey, number>;

  return table.rows.map((row, rowIndex) => {
    const get = (f: ImportFieldKey) => (idx[f] >= 0 ? (row[idx[f]] || "").trim() : "");

    const category = get("category");
    const amountRaw = get("amount");
    const amount = parseFloat(amountRaw);
    const date = get("date") || istDateString();
    const payMethod = get("payMethod") || "Cash";

    let error: string | undefined;
    if (!category) error = "Missing category";
    else if (!categories.some((c) => c.toLowerCase() === category.toLowerCase())) error = `Category "${category}" not found`;
    else if (!amountRaw || Number.isNaN(amount) || amount <= 0) error = "Invalid amount";
    else if (!PAY_METHODS.some((m) => m.toLowerCase() === payMethod.toLowerCase())) error = `Payment method "${payMethod}" not recognized`;

    return {
      rowIndex,
      ok: !error,
      error,
      date,
      category,
      amount: Number.isNaN(amount) ? 0 : amount,
      payMethod,
      description: get("description"),
      customerMobile: get("customerMobile"),
      customerName: get("customerName"),
    };
  });
}

export function ExpenseImportWizard() {
  const router = useRouter();
  const { data: categoriesSetting } = useAppSetting<string[]>("expenseCategories", EXPENSE_CATEGORIES as unknown as string[]);
  const { data: presetsSetting, save: savePresets } = useAppSetting<ImportMappingPresetsSetting>("expenseImportPresets", DEFAULT_IMPORT_MAPPING_PRESETS);
  const createExpense = useCreateExpense();

  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>(blankImportMapping());
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
  const [presetName, setPresetName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const categories: string[] = categoriesSetting || [...EXPENSE_CATEGORIES];

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
      setMapping(blankImportMapping());
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
    const preset: ImportMappingPreset = { id: `preset-${Date.now()}`, name, mapping };
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
    const missingRequired = IMPORT_REQUIRED_FIELDS.filter((f) => !mapping[f]);
    if (missingRequired.length) {
      toast.error(`Map required fields: ${missingRequired.map((f) => IMPORT_FIELD_LABELS[f]).join(", ")}`);
      return;
    }
    setResults(validateRows(table, mapping, categories));
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
        await createExpense.mutateAsync({
          date: row.date,
          category: row.category,
          description: row.description,
          amount: row.amount,
          payMethod: row.payMethod,
          customerMobile: row.customerMobile || null,
          customerName: row.customerName || null,
        });
        setImportedCount((c) => c + 1);
      } catch {
        failed++;
      }
    }

    setImporting(false);
    if (failed) toast.error(`Imported ${validRows.length - failed} expenses, ${failed} failed`);
    else toast.success(`Imported ${validRows.length} expenses`);
    if (validRows.length - failed > 0) router.push("/expenses");
  }

  const validCount = results?.filter((r) => r.ok).length || 0;
  const invalidCount = results ? results.length - validCount : 0;

  return (
    <div className="space-y-5">
      {!table ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Upload className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="mb-3 text-sm text-muted-foreground">Upload a CSV or TSV file — one row per expense.</p>
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
              {IMPORT_FIELD_KEYS.map((field) => (
                <div key={field} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {IMPORT_FIELD_LABELS[field]}
                    {IMPORT_REQUIRED_FIELDS.includes(field) && " *"}
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
                  {importing ? `Importing… (${importedCount}/${validCount})` : `Import ${validCount} expenses`}
                </Button>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">Row</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r) => (
                      <TableRow key={r.rowIndex}>
                        <TableCell className="text-muted-foreground">{r.rowIndex + 1}</TableCell>
                        <TableCell>{r.date}</TableCell>
                        <TableCell>{r.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.amount}</TableCell>
                        <TableCell>{r.payMethod}</TableCell>
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
