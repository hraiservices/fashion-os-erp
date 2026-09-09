"use client";

import { Download, FileSpreadsheet, FileText, Share2 } from "lucide-react";
import { exportXLSX, printReport } from "@/lib/export";
import { buildReportWhatsAppUrl } from "@/lib/report-share";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * The one export/share action every report needs: Excel, PDF and WhatsApp, in a single menu
 * next to the report's own Print button (ReportShell already renders that one for free).
 * "PDF" reuses printReport()'s branded print window rather than a separate PDF-generation
 * library — the browser's own print dialog offers "Save as PDF" as a destination, which is the
 * standard no-extra-dependency way to produce a real PDF file client-side; the same window also
 * serves the Print action from that menu.
 *
 * `rows` drives both the Excel sheet and the PDF/print table — its keys become the column
 * headers verbatim, so pass already-labeled, already-formatted values (e.g. `{ "Tailor": name,
 * "Total payable": "₹1,200" }`), not raw numbers/ids a customer or manager wouldn't recognize.
 */
export function ReportActionsMenu({
  rows,
  filename,
  title,
  summaryLines,
  shopName,
  logoDataUrl,
}: {
  rows: Record<string, unknown>[];
  filename: string;
  title: string;
  /** Short lines for the WhatsApp share text — e.g. ["Range: 1–30 Sep 2026", "Total: ₹12,450"]. */
  summaryLines?: string[];
  shopName?: string;
  logoDataUrl?: string | null;
}) {
  const disabled = rows.length === 0;

  function buildTableHtml(): string {
    const keys = Object.keys(rows[0] || {});
    const head = `<tr>${keys.map((k) => `<th>${k}</th>`).join("")}</tr>`;
    const body = rows.map((r) => `<tr>${keys.map((k) => `<td>${r[k] ?? ""}</td>`).join("")}</tr>`).join("");
    return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={disabled} className="print:hidden">
            <Download className="size-4" /> Export
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportXLSX(rows, filename)}>
          <FileSpreadsheet className="size-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => printReport(title, buildTableHtml(), shopName, logoDataUrl)}>
          <FileText className="size-4" /> PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.open(buildReportWhatsAppUrl(title, summaryLines || []), "_blank", "noopener,noreferrer")}>
          <Share2 className="size-4" /> Share on WhatsApp
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
