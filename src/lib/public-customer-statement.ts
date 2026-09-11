import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { LedgerTransaction } from "@/lib/customer-ledger";

interface RawStatementOrder {
  id: string;
  inDate: string;
  total: number;
  balance: number;
  description: string;
}

interface RawStatementInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  subject: string;
  total: number;
  balance: number;
  paidTotal: number;
}

interface GetCustomerStatementResult {
  customerName: string;
  customerMobile: string;
  orders: RawStatementOrder[] | null;
  invoices: RawStatementInvoice[] | null;
  shopName: string;
  shopPhone: string;
  shopLogoDataUrl: string | null;
}

export interface PublicCustomerStatement {
  customerName: string;
  customerMobile: string;
  transactions: LedgerTransaction[];
  shopName: string;
  shopPhone: string;
  shopLogoDataUrl: string | null;
}

/** Calls the security-definer `get_customer_statement` RPC — the only anon-reachable entry
 *  point for a customer's statement link. Returns null for an unknown/revoked token, same as
 *  fetchPublicOrderStatus. Rows are already in `LedgerTransaction` shape so the public page can
 *  reuse the same rendering as the internal statement. */
export async function fetchPublicCustomerStatement(supabase: SupabaseClient<Database>, token: string): Promise<PublicCustomerStatement | null> {
  const { data, error } = await supabase.rpc("get_customer_statement", { p_token: token });
  if (error || !data) return null;

  const result = data as unknown as GetCustomerStatementResult;

  const orderRows: LedgerTransaction[] = (result.orders || []).map((o) => ({
    id: `order-${o.id}`,
    date: o.inDate,
    type: "stitching",
    reference: o.id,
    description: o.description || "Stitching order",
    billed: o.total || 0,
    paid: Math.max(0, (o.total || 0) - (o.balance || 0)),
    balance: o.balance || 0,
    href: "",
  }));

  const invoiceRows: LedgerTransaction[] = (result.invoices || []).map((inv) => ({
    id: `invoice-${inv.id}`,
    date: inv.invoiceDate,
    type: "retail",
    reference: inv.invoiceNumber,
    description: inv.subject || "Product sale",
    billed: inv.total || 0,
    paid: inv.paidTotal || 0,
    balance: inv.balance || 0,
    href: "",
  }));

  const transactions = [...orderRows, ...invoiceRows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    customerName: result.customerName || "",
    customerMobile: result.customerMobile || "",
    transactions,
    shopName: result.shopName || "",
    shopPhone: result.shopPhone || "",
    shopLogoDataUrl: result.shopLogoDataUrl || null,
  };
}
