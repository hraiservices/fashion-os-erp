/**
 * Configurable sequential document numbering (Settings > Document Numbering). Off by default —
 * existing random-ish generators (genInvoiceNumber, newOrderId) keep working unchanged unless a
 * shop opts in per document type. When enabled, the actual next number comes from the
 * next_document_number() Postgres function (add_document_numbering.sql) — never generated
 * client-side, since a real sequence needs an atomic, race-safe increment.
 */

export type DocType = "invoice" | "stitching_order";

export interface DocNumberFormat {
  enabled: boolean;
  /** e.g. "INV" */
  prefix: string;
  includeYear: boolean;
  /** e.g. "/" or "-" */
  separator: string;
  /** Digits the running number is zero-padded to, e.g. 4 -> 0001 */
  padding: number;
  /** true = counter resets to startNumber every calendar year; false = one continuous sequence forever */
  resetYearly: boolean;
  /** Where a brand-new sequence begins — lets a shop continue from their old system's numbering. */
  startNumber: number;
}

export interface DocumentNumberingSettings {
  invoice: DocNumberFormat;
  stitchingOrder: DocNumberFormat;
}

// "/" is deliberately never a valid separator here — the formatted number becomes the actual
// order/invoice id, which is used verbatim as a URL segment (/orders/[id]) and in plenty of
// other places that don't expect a path separator inside an id. Anything containing "/" 404s.
export const INVALID_SEPARATOR = "/";

const BLANK_FORMAT = (prefix: string): DocNumberFormat => ({
  enabled: false,
  prefix,
  includeYear: true,
  separator: "-",
  padding: 4,
  resetYearly: true,
  startNumber: 1,
});

export const DEFAULT_DOCUMENT_NUMBERING: DocumentNumberingSettings = {
  invoice: BLANK_FORMAT("INV"),
  stitchingOrder: BLANK_FORMAT("SOR"),
};

/** The period_key passed to next_document_number() — the year if resetting yearly, else a
 *  constant so every call shares one continuous sequence. */
export function periodKeyFor(fmt: DocNumberFormat, year: number): string {
  return fmt.resetYearly ? String(year) : "ALL";
}

export function formatDocNumber(fmt: DocNumberFormat, n: number, year: number): string {
  const num = String(n).padStart(fmt.padding, "0");
  const parts = [fmt.prefix, ...(fmt.includeYear ? [String(year)] : []), num];
  // The settings form blocks typing "/" going forward, but that's a UI-only guard — a shop
  // whose app_settings row was saved back when "/" was still the default separator (as this
  // one was) keeps generating broken ids from every order/invoice created after the UI fix,
  // since nothing here re-validates what was already persisted. Sanitize at the point the
  // separator actually gets used, so a stale stored value can never produce another one.
  const separator = fmt.separator === INVALID_SEPARATOR ? "-" : fmt.separator;
  return parts.join(separator);
}

/** Live one-line preview shown in the settings UI, e.g. "INV/2026/0001". */
export function previewDocNumber(fmt: DocNumberFormat): string {
  return formatDocNumber(fmt, fmt.startNumber, new Date().getFullYear());
}
