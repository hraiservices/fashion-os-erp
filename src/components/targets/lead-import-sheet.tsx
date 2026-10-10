"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LEAD_IMPORT_COLUMNS, LEAD_IMPORT_MAX_ROWS, parseImportRow, type ImportLeadRow } from "@/lib/lead-import";
import type { StageLabelOverrides } from "@/lib/lead-stages";
import { useImportLeads } from "@/hooks/use-targets";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Import leads from an Excel or CSV file: download the template, fill it in, choose the file,
 * check the count, import. A lead whose mobile matches an open lead is updated instead of added.
 */
export function LeadImportSheet({ open, onOpenChange, labels }: { open: boolean; onOpenChange: (o: boolean) => void; labels?: StageLabelOverrides }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const importLeads = useImportLeads();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportLeadRow[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number; problems: { row: number; message: string }[] } | null>(null);

  function reset() {
    setFileName("");
    setRows([]);
    setError("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const sample = [Object.fromEntries(LEAD_IMPORT_COLUMNS.map((c, i) => [c, ["Asha Verma", "9876543210", "Bridal lehenga", 45000, "Instagram", "", "New", "Yes", "Wants delivery before Diwali"][i]]))];
    const ws = XLSX.utils.json_to_sheet(sample, { header: [...LEAD_IMPORT_COLUMNS] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, "leads-import-template.xlsx");
  }

  async function onFile(file: File | undefined) {
    reset();
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setError("That file is too big. Keep it under 2 MB.");
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return setError("Choose an Excel (.xlsx) or CSV file.");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const parsed = raw.map((r) => parseImportRow(r, labels));
      if (parsed.length === 0) return setError("The file has no rows.");
      if (parsed.length > LEAD_IMPORT_MAX_ROWS) return setError(`Import up to ${LEAD_IMPORT_MAX_ROWS} leads at a time. This file has ${parsed.length}.`);
      if (!parsed.some((r) => r.name)) return setError("No Name column found. Use the template's column headings.");
      setFileName(file.name);
      setRows(parsed);
    } catch {
      setError("Couldn't read that file. Try the template.");
    }
  }

  function run() {
    importLeads.mutate(rows, {
      onSuccess: (r) => {
        setResult(r);
        toast.success(`${r.added} added, ${r.updated} updated`);
      },
      onError: (e) => setError(e instanceof Error ? e.message : "Import failed"),
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Import leads</SheetTitle>
          <SheetDescription>Excel (.xlsx) or CSV. A lead with the same mobile as an open lead is updated, not repeated.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <Button variant="outline" className="h-12 w-full" onClick={downloadTemplate}>
            <Download className="size-4" /> Download template
          </Button>
          <p className="text-xs text-muted-foreground">Columns: {LEAD_IMPORT_COLUMNS.join(" · ")}. Only Name is required. Owner is a staff member&apos;s name. Stage can be New, Talking, Visit or Quoted.</p>

          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button className="h-12 w-full" variant={rows.length ? "outline" : "default"} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> {fileName ? "Choose a different file" : "Choose file"}
          </Button>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {rows.length > 0 && !result && (
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <FileSpreadsheet className="size-4 text-primary" /> {fileName}
              </p>
              <p className="text-sm text-muted-foreground">{rows.length} rows found. Examples: {rows.slice(0, 3).map((r) => r.name || "(no name)").join(", ")}</p>
              <Button className="h-12 w-full text-base" disabled={importLeads.isPending} onClick={run}>
                {importLeads.isPending ? "Importing…" : `Import ${rows.length} leads`}
              </Button>
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
              <p className="font-semibold">
                {result.added} added · {result.updated} updated · {result.skipped} skipped
              </p>
              {result.problems.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {result.problems.map((p, i) => (
                    <li key={i}>
                      Row {p.row}: {p.message}
                    </li>
                  ))}
                </ul>
              )}
              <Button className="h-11 w-full" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
