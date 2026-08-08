import type { SupabaseClient } from "@supabase/supabase-js";
import { mapSalesInvoiceRow, type SalesInvoice, type SalesInvoiceRow } from "@/lib/types";
import { deriveInvoiceBalance } from "@/lib/sales";
import { DEFAULT_INVOICE_TEMPLATES_SETTING, getDefaultTemplate, type InvoiceTemplateConfig, type InvoiceTemplatesSetting } from "@/lib/invoice-template";
import type { Database } from "@/lib/supabase/database.types";

export interface PublicInvoiceData {
  invoice: SalesInvoice;
  paidTotal: number;
  creditsTotal: number;
  balance: number;
  shopName: string;
  shopPhone: string;
  template: InvoiceTemplateConfig;
}

interface GetPublicInvoiceResult {
  invoice: SalesInvoiceRow;
  paidTotal: number;
  creditsTotal: number;
  shopName: string;
  shopPhone: string;
  invoiceTemplates: InvoiceTemplatesSetting | null;
}

/** Calls the security-definer `get_public_invoice` RPC — the only anon-reachable entry point for a shared invoice link. */
export async function fetchPublicInvoice(supabase: SupabaseClient<Database>, token: string): Promise<PublicInvoiceData | null> {
  const { data, error } = await supabase.rpc("get_public_invoice", { p_token: token });
  if (error || !data) return null;

  const result = data as unknown as GetPublicInvoiceResult;
  const invoice = mapSalesInvoiceRow(result.invoice);
  const paidTotal = result.paidTotal || 0;
  const creditsTotal = result.creditsTotal || 0;

  return {
    invoice,
    paidTotal,
    creditsTotal,
    balance: deriveInvoiceBalance(invoice.total, creditsTotal, paidTotal),
    shopName: result.shopName || "",
    shopPhone: result.shopPhone || "",
    template: getDefaultTemplate(result.invoiceTemplates || DEFAULT_INVOICE_TEMPLATES_SETTING),
  };
}
