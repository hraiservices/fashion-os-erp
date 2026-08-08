"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Upload, CheckCircle2, XCircle, Save } from "lucide-react";
import { useProducts } from "@/hooks/use-products";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSaveInvoice } from "@/hooks/use-sales-mutations";
import { parseDelimitedText, type ParsedTable } from "@/lib/csv-parse";
import { genInvoiceNumber } from "@/lib/sales";
import { DEFAULT_INVOICE_TERMS } from "@/lib/invoice-settings";
import { GST_TYPE_LABELS, type GstType } from "@/lib/gst";
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
} from "@/lib/invoice-import";
import type { Product } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const UNMAPPED = "__unmapped__";

function matchProduct(products: Product[], text: string): Product | undefined {
  const q = text.trim().toLowerCase();
  if (!q) return undefined;
  return products.find((p) => p.name.toLowerCase() === q) || products.find((p) => p.sku.toLowerCase() === q);
}

function validateRows(table: ParsedTable, mapping: ImportMapping, products: Product[]): ImportRowResult[] {
  const colIndex = (field: ImportFieldKey) => {
    const header = mapping[field];
    return header ? table.headers.indexOf(header) : -1;
  };
  const idx = Object.fromEntries(IMPORT_FIELD_KEYS.map((f) => [f, colIndex(f)])) as Record<ImportFieldKey, number>;

  return table.rows.map((row, rowIndex) => {
    const get = (f: ImportFieldKey) => (idx[f] >= 0 ? (row[idx[f]] || "").trim() : "");

    const customerMobile = get("customerMobile");
    const productText = get("product");
    const qtyRaw = get("qty");
    const qty = parseFloat(qtyRaw);
    const product = matchProduct(products, productText);
    const unitPriceRaw = get("unitPrice");
    const unitPrice = unitPriceRaw ? parseFloat(unitPriceRaw) : product?.sellingPrice || 0;
    const discountRaw = get("discountPercent");
    const discountPercent = discountRaw ? parseFloat(discountRaw) : 0;
    const invoiceDate = get("invoiceDate") || new Date().toISOString().slice(0, 10);

    let error: string | undefined;
    if (!customerMobile) error = "Missing customer mobile";
    else if (!productText) error = "Missing product";
    else if (!product) error = `Product "${productText}" not found`;
    else if (!qtyRaw || Number.isNaN(qty) || qty <= 0) error = "Invalid quantity";
    else if (Number.isNaN(unitPrice) || unitPrice < 0) error = "Invalid unit price";

    return {
      rowIndex,
      ok: !error,
      error,
      customerMobile,
      customerName: get("customerName") || customerMobile,
      invoiceDate,
      productId: product?.id || "",
      productName: product?.name || productText,
      qty: Number.isNaN(qty) ? 0 : qty,
      unitPrice: Number.isNaN(unitPrice) ? 0 : unitPrice,
      discountPercent: Number.isNaN(discountPercent) ? 0 : discountPercent,
      notes: get("notes"),
    };
  });
}

export function InvoiceImportWizard() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: products } = useProducts();
  const { data: defaultTerms } = useAppSetting<string>("invoiceTerms", DEFAULT_INVOICE_TERMS);
  const { data: presetsSetting, save: savePresets } = useAppSetting<ImportMappingPresetsSetting>("invoiceImportPresets", DEFAULT_IMPORT_MAPPING_PRESETS);
  const saveInvoice = useSaveInvoice();

  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>(blankImportMapping());
  const [gstType, setGstType] = useState<GstType>("intra");
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
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
    setResults(validateRows(table, mapping, products || []));
  }

  async function runImport() {
    if (!results) return;
    const validRows = results.filter((r) => r.ok);
    if (validRows.length === 0) return;
    setImporting(true);
    setImportedCount(0);
    const usedNumbers = new Set<string>();
    let failed = 0;

    for (const row of validRows) {
      let invoiceNumber = genInvoiceNumber();
      while (usedNumbers.has(invoiceNumber)) invoiceNumber = genInvoiceNumber();
      usedNumbers.add(invoiceNumber);

      const amount = Math.round(row.qty * row.unitPrice * (1 - Math.min(100, Math.max(0, row.discountPercent)) / 100) * 100) / 100;
      const product = (products || []).find((p) => p.id === row.productId);

      try {
        await saveInvoice.mutateAsync({
          invoiceNumber,
          customerMobile: row.customerMobile,
          customerName: row.customerName,
          invoiceDate: row.invoiceDate,
          items: [
            {
              productId: row.productId,
              productName: row.productName,
              qty: row.qty,
              unitPrice: row.unitPrice,
              discountPercent: row.discountPercent,
              amount,
            },
          ],
          subject: "",
          shippingCharges: 0,
          discountType: "flat",
          discountValue: 0,
          gstType,
          taxRate: product?.taxRate || 0,
          docStatus: "draft",
          terms: defaultTerms || DEFAULT_INVOICE_TERMS,
          notes: row.notes,
          userEmail: user?.email,
        });
        setImportedCount((c) => c + 1);
      } catch {
        failed++;
      }
    }

    setImporting(false);
    if (failed) toast.error(`Imported ${validRows.length - failed} invoices, ${failed} failed`);
    else toast.success(`Imported ${validRows.length} invoices as drafts`);
    if (validRows.length - failed > 0) router.push("/sales/invoices");
  }

  const validCount = results?.filter((r) => r.ok).length || 0;
  const invalidCount = results ? results.length - validCount : 0;

  return (
    <div className="space-y-5">
      {!table ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Upload className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="mb-3 text-sm text-muted-foreground">Upload a CSV or TSV file — one row per invoice line item.</p>
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
                    <SelectTrigger className="w-full">
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
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">GST type (applied to all)</label>
                <Select value={gstType} onValueChange={(v) => v && setGstType(v as GstType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(GST_TYPE_LABELS) as GstType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {GST_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                  {importing ? `Importing… (${importedCount}/${validCount})` : `Import ${validCount} invoices as drafts`}
                </Button>
              </div>
              <div className="max-h-96 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">Row</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r) => (
                      <TableRow key={r.rowIndex}>
                        <TableCell className="text-muted-foreground">{r.rowIndex + 1}</TableCell>
                        <TableCell>{r.customerName || r.customerMobile}</TableCell>
                        <TableCell>{r.productName}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.unitPrice}</TableCell>
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
