/**
 * Minimal CSV/TSV parser — handles quoted fields (with embedded delimiters, newlines, and
 * escaped "" quotes) without pulling in a dependency. Delimiter is auto-detected from the
 * first line: whichever of comma/tab appears more often wins.
 */
export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

function detectDelimiter(firstLine: string): string {
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

export function parseDelimitedText(text: string): ParsedTable {
  const cleaned = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLineEnd = cleaned.indexOf("\n");
  const delimiter = detectDelimiter(firstLineEnd === -1 ? cleaned : cleaned.slice(0, firstLineEnd));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const [headers, ...dataRows] = nonEmptyRows;
  return { headers: (headers || []).map((h) => h.trim()), rows: dataRows };
}
