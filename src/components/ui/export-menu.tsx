"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportCSV, exportXLSX } from "@/lib/export";
import { Button, type buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { VariantProps } from "class-variance-authority";

/**
 * Drop-in replacement for the old single "Export CSV" button — same `rows`/`filename` contract
 * as exportCSV()/exportXLSX() in src/lib/export.ts, just offers a choice of format. Used across
 * every report and list page that has an export action.
 */
export function ExportMenu({
  rows,
  filename,
  sheetName,
  label = "Export",
  variant = "outline",
  size = "sm",
  disabled,
}: {
  rows: Record<string, unknown>[];
  filename: string;
  sheetName?: string;
  label?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant={variant} size={size} disabled={disabled || rows.length === 0}>
            <Download className="size-4" /> {label}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportXLSX(rows, filename, sheetName)}>
          <FileSpreadsheet className="size-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportCSV(rows, filename)}>
          <FileText className="size-4" /> CSV (.csv)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
