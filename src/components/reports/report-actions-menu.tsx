"use client";

import { Download, FileSpreadsheet, FileText, Share2 } from "lucide-react";
import { exportXLSX, printReport } from "@/lib/export";
import { buildReportWhatsAppUrl } from "@/lib/report-share";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { escapeHtml } from "@/lib/escape-html";

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
  hideWhatsApp = false,
  label = "Export",
}: {
  rows: Record<string, unknown>[];
  filename: string;
  title: string;
  /** Short lines for the WhatsApp share text — e.g. ["Range: 1–30 Sep 2026", "Total: ₹12,450"]. */
  summaryLines?: string[];
  shopName?: string;
  logoDataUrl?: string | null;
  /** The page offers its own Share button (WhatsApp, Email, Copy, a team member) — leave the plain WhatsApp item out. */
  hideWhatsApp?: boolean;
  /** Button text — give each menu its own when a page has two. */
  label?: string;
}) {
  const disabled = rows.length === 0;

  function buildTableHtml(): string {
    // Every cell is escaped. Report rows carry customer, product and lead names — and a lead
    // name arrives from the public enquiry form, with no login — so an unescaped cell put
    // attacker-controlled markup into the printed document, which opens on this app's own
    // origin and can read the staff session out of localStorage.
    const keys = Object.keys(rows[0] || {});
    const head = `<tr>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join("")}</tr>`;
    const body = rows.map((r) => `<tr>${keys.map((k) => `<td>${escapeHtml(r[k] ?? "")}</td>`).join("")}</tr>`).join("");
    return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={disabled} className="print:hidden">
            <Download className="size-4" /> {label}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportXLSX(rows, filename)}>
          <FileSpreadsheet className="size-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => printReport(title, buildTableHtml(), shopName, logoDataUrl, summaryLines)}>
          <FileText className="size-4" /> PDF
        </DropdownMenuItem>
        {!hideWhatsApp && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.open(buildReportWhatsAppUrl(title, summaryLines || []), "_blank", "noopener,noreferrer")}>
              <Share2 className="size-4" /> Share on WhatsApp
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
