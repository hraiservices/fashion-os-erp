import type { Database, Json } from "@/lib/supabase/database.types";
import { deriveBalance, type Stage } from "@/lib/business-rules";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  payMethod: string;
  customerMobile: string | null;
  customerName: string | null;
  createdBy: string | null;
  createdAt: string;
}

export function mapExpenseRow(r: ExpenseRow): Expense {
  return {
    id: r.id,
    date: r.date,
    category: r.category,
    description: r.description || "",
    amount: r.amount,
    payMethod: r.pay_method,
    customerMobile: r.customer_mobile,
    customerName: r.customer_name,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export const EXPENSE_CATEGORIES = [
  "Salaries",
  "Rent",
  "Electricity",
  "Materials",
  "Equipment",
  "Marketing",
  "Transport",
  "Maintenance",
  "Miscellaneous",
] as const;
export type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export interface Garment {
  type: string;
  lining?: "s" | "h" | "f" | string;
  no?: number;
  amount?: number;
  [key: string]: Json | undefined;
}

export interface Order {
  id: string;
  name: string;
  mobile: string;
  inDate: string;
  deliveryDate: string;
  garments: Garment[];
  total: number;
  advance: number;
  balance: number;
  tailor: string;
  status: Stage;
  special: string;
  history: string[];
  measurements: Record<string, Json>;
  images: string[];
  audios: string[];
  videos: string[];
  payments: Json[];
  payBreakdown: Json | null;
  createdAt: string;
}

/** mapRow(), Stitching_Manager_Pro_v16.html ~line 2265. Balance is always derived. */
export function mapOrderRow(r: OrderRow): Order {
  const total = r.total || 0;
  const advance = r.advance || 0;
  return {
    id: r.id,
    name: r.name || "",
    mobile: r.mobile || "",
    inDate: typeof r.in_date === "string" ? r.in_date : "",
    deliveryDate: typeof r.delivery_date === "string" ? r.delivery_date : "",
    garments: (Array.isArray(r.garments) ? r.garments : []) as unknown as Garment[],
    total,
    advance,
    balance: deriveBalance(total, advance),
    tailor: r.tailor || "",
    // Legacy "trial" stage folded into "ready" — trial was removed from the workflow.
    status: (r.status === "trial" ? "ready" : r.status || "received") as Stage,
    special: r.special || "",
    history: (Array.isArray(r.history) ? r.history : []) as unknown as string[],
    measurements: (r.measurements || {}) as Record<string, Json>,
    images: (Array.isArray(r.images) ? r.images : []) as unknown as string[],
    audios: (Array.isArray(r.audios) ? r.audios : []) as unknown as string[],
    videos: (Array.isArray(r.videos) ? r.videos : []) as unknown as string[],
    payments: (Array.isArray(r.payments) ? r.payments : []) as Json[],
    payBreakdown: r.pay_breakdown ?? null,
    createdAt: r.created_at || "",
  };
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  dob: string;
  anniversary: string;
  address: string;
  measurements: Record<string, Json>;
  notes: string;
  createdAt: string;
  loyaltyPoints: number;
  totalEarned: number;
  loyaltyHistory: Json[];
  paymentTerms: string;
  priceListId: string | null;
}

/** mapCust(), line ~2324. */
export function mapCustomerRow(r: CustomerRow): Customer {
  return {
    id: r.id,
    name: r.name || "",
    mobile: r.mobile || "",
    email: r.email || "",
    dob: r.dob || "",
    anniversary: r.anniversary || "",
    address: r.address || "",
    measurements: (r.measurements || {}) as Record<string, Json>,
    notes: r.notes || "",
    createdAt: r.created_at,
    loyaltyPoints: r.loyalty_points || 0,
    totalEarned: r.total_points_earned || 0,
    loyaltyHistory: (Array.isArray(r.loyalty_history) ? r.loyalty_history : []) as Json[],
    paymentTerms: r.payment_terms || "due_on_receipt",
    priceListId: r.price_list_id,
  };
}

export type PriceListRow = Database["public"]["Tables"]["price_lists"]["Row"];
export type PriceListItemRow = Database["public"]["Tables"]["price_list_items"]["Row"];

export interface PriceList {
  id: string;
  name: string;
  notes: string;
  createdAt: string;
}

export interface PriceListItem {
  id: string;
  priceListId: string;
  productId: string;
  price: number;
}

export function mapPriceListRow(r: PriceListRow): PriceList {
  return { id: r.id, name: r.name || "", notes: r.notes || "", createdAt: r.created_at };
}

export function mapPriceListItemRow(r: PriceListItemRow): PriceListItem {
  return { id: r.id, priceListId: r.price_list_id, productId: r.product_id, price: r.price || 0 };
}

// ── Inventory (Phase 1) ──────────────────────────────────────────────────────

export type UnitRow = Database["public"]["Tables"]["units_of_measure"]["Row"];
export type RawMaterialRow = Database["public"]["Tables"]["raw_materials"]["Row"];
export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type BomRow = Database["public"]["Tables"]["bill_of_materials"]["Row"];
export type LedgerEntryRow = Database["public"]["Tables"]["inventory_ledger"]["Row"];

export interface UnitOfMeasure {
  id: string;
  name: string;
}

export function mapUnitRow(r: UnitRow): UnitOfMeasure {
  return { id: r.id, name: r.name };
}

export interface RawMaterial {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  costPerUnit: number;
  category: string;
  lowStockAlert: number;
  notes: string;
  stockQty: number;
  createdAt: string;
}

export function mapRawMaterialRow(r: RawMaterialRow, unitName: string, stockQty: number): RawMaterial {
  return {
    id: r.id,
    name: r.name || "",
    unitId: r.unit_id,
    unitName,
    costPerUnit: r.cost_per_unit || 0,
    category: r.category || "",
    lowStockAlert: r.low_stock_alert || 0,
    notes: r.notes || "",
    stockQty,
    createdAt: r.created_at,
  };
}

export interface BomLine {
  id: string;
  rawMaterialId: string;
  rawMaterialName: string;
  unitName: string;
  qtyRequired: number;
}

export function mapBomRow(r: BomRow, rawMaterialName: string, unitName: string): BomLine {
  return {
    id: r.id,
    rawMaterialId: r.raw_material_id,
    rawMaterialName,
    unitName,
    qtyRequired: r.qty_required,
  };
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  sellingPrice: number;
  /** Manual cost price — separate from BOM-derived manufacturing cost, for ready-made/resale items. */
  costPrice: number;
  taxRate: number;
  lowStockAlert: number;
  notes: string;
  stockQty: number;
  bom: BomLine[];
  createdAt: string;
}

export function mapProductRow(r: ProductRow, stockQty: number, bom: BomLine[]): Product {
  return {
    id: r.id,
    name: r.name || "",
    sku: r.sku || "",
    category: r.category || "",
    sellingPrice: r.selling_price || 0,
    costPrice: r.cost_price || 0,
    taxRate: r.tax_rate ?? 5,
    lowStockAlert: r.low_stock_alert || 0,
    notes: r.notes || "",
    stockQty,
    bom,
    createdAt: r.created_at,
  };
}

export interface LedgerEntry {
  id: string;
  itemType: "raw_material" | "product";
  itemId: string;
  movement: number;
  refType: string;
  refId: string | null;
  note: string;
  createdBy: string | null;
  createdAt: string;
}

export function mapLedgerRow(r: LedgerEntryRow): LedgerEntry {
  return {
    id: r.id,
    itemType: r.item_type as "raw_material" | "product",
    itemId: r.item_id,
    movement: r.movement,
    refType: r.ref_type,
    refId: r.ref_id,
    note: r.note || "",
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

// ── Purchases (Phase 2) ──────────────────────────────────────────────────────

import type { PurchaseLineItem, PoStatus } from "@/lib/purchases";
import type { GstType } from "@/lib/gst";

export type VendorRow = Database["public"]["Tables"]["vendors"]["Row"];
export type PurchaseOrderRow = Database["public"]["Tables"]["purchase_orders"]["Row"];
export type PurchaseBillRow = Database["public"]["Tables"]["purchase_bills"]["Row"];
export type VendorPaymentRow = Database["public"]["Tables"]["vendor_payments"]["Row"];
export type VendorCreditRow = Database["public"]["Tables"]["vendor_credits"]["Row"];

export interface Vendor {
  id: string;
  name: string;
  mobile: string;
  email: string;
  gstin: string;
  state: string;
  address: string;
  notes: string;
  createdAt: string;
}

export function mapVendorRow(r: VendorRow): Vendor {
  return {
    id: r.id,
    name: r.name || "",
    mobile: r.mobile || "",
    email: r.email || "",
    gstin: r.gstin || "",
    state: r.state || "",
    address: r.address || "",
    notes: r.notes || "",
    createdAt: r.created_at,
  };
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId: string;
  date: string;
  status: PoStatus;
  items: PurchaseLineItem[];
  total: number;
  notes: string;
  createdAt: string;
}

export function mapPurchaseOrderRow(r: PurchaseOrderRow): PurchaseOrder {
  return {
    id: r.id,
    poNumber: r.po_number,
    vendorId: r.vendor_id,
    date: r.date,
    status: (r.status as PoStatus) || "draft",
    items: (Array.isArray(r.items) ? r.items : []) as unknown as PurchaseLineItem[],
    total: r.total || 0,
    notes: r.notes || "",
    createdAt: r.created_at,
  };
}

export interface PurchaseBill {
  id: string;
  billNumber: string;
  vendorId: string;
  poId: string | null;
  billDate: string;
  dueDate: string | null;
  items: PurchaseLineItem[];
  taxableAmount: number;
  gstType: GstType;
  taxRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  notes: string;
  createdAt: string;
}

export function mapPurchaseBillRow(r: PurchaseBillRow): PurchaseBill {
  return {
    id: r.id,
    billNumber: r.bill_number,
    vendorId: r.vendor_id,
    poId: r.po_id,
    billDate: r.bill_date,
    dueDate: r.due_date,
    items: (Array.isArray(r.items) ? r.items : []) as unknown as PurchaseLineItem[],
    taxableAmount: r.taxable_amount || 0,
    gstType: (r.gst_type as GstType) || "none",
    taxRate: r.tax_rate || 0,
    cgst: r.cgst || 0,
    sgst: r.sgst || 0,
    igst: r.igst || 0,
    total: r.total || 0,
    notes: r.notes || "",
    createdAt: r.created_at,
  };
}

export interface VendorPayment {
  id: string;
  billId: string;
  vendorId: string;
  amount: number;
  method: string;
  date: string;
  note: string;
  createdAt: string;
}

export function mapVendorPaymentRow(r: VendorPaymentRow): VendorPayment {
  return {
    id: r.id,
    billId: r.bill_id,
    vendorId: r.vendor_id,
    amount: r.amount,
    method: r.method || "Cash",
    date: r.date,
    note: r.note || "",
    createdAt: r.created_at,
  };
}

export interface VendorCredit {
  id: string;
  creditNumber: string;
  vendorId: string;
  billId: string | null;
  date: string;
  items: PurchaseLineItem[];
  total: number;
  reason: string;
  notes: string;
  createdAt: string;
}

export function mapVendorCreditRow(r: VendorCreditRow): VendorCredit {
  return {
    id: r.id,
    creditNumber: r.credit_number,
    vendorId: r.vendor_id,
    billId: r.bill_id,
    date: r.date,
    items: (Array.isArray(r.items) ? r.items : []) as unknown as PurchaseLineItem[],
    total: r.total || 0,
    reason: r.reason || "",
    notes: r.notes || "",
    createdAt: r.created_at,
  };
}

// ── Manufacturing (Phase 3) ──────────────────────────────────────────────────

import type { WorkOrderMaterial, WoStatus } from "@/lib/manufacturing";

export type WorkOrderRow = Database["public"]["Tables"]["work_orders"]["Row"];

export interface WorkOrder {
  id: string;
  woNumber: string;
  productId: string;
  productName: string;
  qtyToProduce: number;
  tailor: string;
  startDate: string;
  dueDate: string | null;
  status: WoStatus;
  materials: WorkOrderMaterial[];
  laborCostPerPiece: number;
  materialCost: number | null;
  wastageCost: number | null;
  laborCost: number | null;
  totalCost: number | null;
  costPerUnit: number | null;
  notes: string;
  completedAt: string | null;
  createdAt: string;
}

// ── Sales (Phase 4) ──────────────────────────────────────────────────────────

import type { SalesLineItem, QuoteStatus } from "@/lib/sales";

export type SalesQuotationRow = Database["public"]["Tables"]["sales_quotations"]["Row"];
export type SalesInvoiceRow = Database["public"]["Tables"]["sales_invoices"]["Row"];
export type SalesPaymentRow = Database["public"]["Tables"]["sales_payments"]["Row"];
export type SalesCreditNoteRow = Database["public"]["Tables"]["sales_credit_notes"]["Row"];

export interface SalesQuotation {
  id: string;
  quoteNumber: string;
  customerMobile: string;
  customerName: string;
  date: string;
  validUntil: string | null;
  status: QuoteStatus;
  items: SalesLineItem[];
  taxableAmount: number;
  gstType: GstType;
  taxRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  notes: string;
  createdAt: string;
}

export function mapSalesQuotationRow(r: SalesQuotationRow): SalesQuotation {
  return {
    id: r.id,
    quoteNumber: r.quote_number,
    customerMobile: r.customer_mobile,
    customerName: r.customer_name || "",
    date: r.date,
    validUntil: r.valid_until,
    status: (r.status as QuoteStatus) || "draft",
    items: (Array.isArray(r.items) ? r.items : []) as unknown as SalesLineItem[],
    taxableAmount: r.taxable_amount || 0,
    gstType: (r.gst_type as GstType) || "none",
    taxRate: r.tax_rate || 0,
    cgst: r.cgst || 0,
    sgst: r.sgst || 0,
    igst: r.igst || 0,
    total: r.total || 0,
    notes: r.notes || "",
    createdAt: r.created_at,
  };
}

export type InvoiceDocStatus = "draft" | "sent" | "viewed";

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  customerMobile: string;
  customerName: string;
  quoteId: string | null;
  invoiceDate: string;
  dueDate: string | null;
  items: SalesLineItem[];
  subject: string;
  shippingCharges: number;
  discountType: "flat" | "percent";
  discountValue: number;
  taxableAmount: number;
  gstType: GstType;
  taxRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
  docStatus: InvoiceDocStatus;
  terms: string;
  notes: string;
  shareToken: string;
  viewedAt: string | null;
  createdAt: string;
}

export function mapSalesInvoiceRow(r: SalesInvoiceRow): SalesInvoice {
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    customerMobile: r.customer_mobile,
    customerName: r.customer_name || "",
    quoteId: r.quote_id,
    invoiceDate: r.invoice_date,
    dueDate: r.due_date,
    items: (Array.isArray(r.items) ? r.items : []) as unknown as SalesLineItem[],
    subject: r.subject || "",
    shippingCharges: r.shipping_charges || 0,
    discountType: (r.discount_type as "flat" | "percent") || "flat",
    discountValue: r.discount_value || 0,
    taxableAmount: r.taxable_amount || 0,
    gstType: (r.gst_type as GstType) || "none",
    taxRate: r.tax_rate || 0,
    cgst: r.cgst || 0,
    sgst: r.sgst || 0,
    igst: r.igst || 0,
    roundOff: r.round_off || 0,
    total: r.total || 0,
    docStatus: (r.doc_status as InvoiceDocStatus) || "draft",
    terms: r.terms || "",
    notes: r.notes || "",
    shareToken: r.share_token,
    viewedAt: r.viewed_at,
    createdAt: r.created_at,
  };
}

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "yearly";
export type RecurringEndType = "never" | "on_date" | "after_count";

export type RecurringInvoiceProfileRow = Database["public"]["Tables"]["recurring_invoice_profiles"]["Row"];

export interface RecurringInvoiceProfile {
  id: string;
  name: string;
  customerMobile: string;
  customerName: string;
  items: SalesLineItem[];
  subject: string;
  shippingCharges: number;
  discountType: "flat" | "percent";
  discountValue: number;
  gstType: GstType;
  taxRate: number;
  terms: string;
  notes: string;
  frequency: RecurringFrequency;
  nextRunDate: string;
  endType: RecurringEndType;
  endDate: string | null;
  endAfterCount: number | null;
  occurrencesGenerated: number;
  active: boolean;
  lastGeneratedAt: string | null;
  createdAt: string;
}

export function mapRecurringInvoiceProfileRow(r: RecurringInvoiceProfileRow): RecurringInvoiceProfile {
  return {
    id: r.id,
    name: r.name || "",
    customerMobile: r.customer_mobile,
    customerName: r.customer_name || "",
    items: (Array.isArray(r.items) ? r.items : []) as unknown as SalesLineItem[],
    subject: r.subject || "",
    shippingCharges: r.shipping_charges || 0,
    discountType: (r.discount_type as "flat" | "percent") || "flat",
    discountValue: r.discount_value || 0,
    gstType: (r.gst_type as GstType) || "none",
    taxRate: r.tax_rate || 0,
    terms: r.terms || "",
    notes: r.notes || "",
    frequency: (r.frequency as RecurringFrequency) || "monthly",
    nextRunDate: r.next_run_date,
    endType: (r.end_type as RecurringEndType) || "never",
    endDate: r.end_date,
    endAfterCount: r.end_after_count,
    occurrencesGenerated: r.occurrences_generated || 0,
    active: r.active,
    lastGeneratedAt: r.last_generated_at,
    createdAt: r.created_at,
  };
}

export interface SalesPayment {
  id: string;
  invoiceId: string;
  customerMobile: string;
  amount: number;
  method: string;
  date: string;
  note: string;
  createdAt: string;
}

export function mapSalesPaymentRow(r: SalesPaymentRow): SalesPayment {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    customerMobile: r.customer_mobile,
    amount: r.amount,
    method: r.method || "Cash",
    date: r.date,
    note: r.note || "",
    createdAt: r.created_at,
  };
}

export interface SalesCreditNote {
  id: string;
  creditNumber: string;
  invoiceId: string;
  customerMobile: string;
  date: string;
  items: SalesLineItem[];
  total: number;
  reason: string;
  notes: string;
  createdAt: string;
}

export function mapSalesCreditNoteRow(r: SalesCreditNoteRow): SalesCreditNote {
  return {
    id: r.id,
    creditNumber: r.credit_number,
    invoiceId: r.invoice_id,
    customerMobile: r.customer_mobile,
    date: r.date,
    items: (Array.isArray(r.items) ? r.items : []) as unknown as SalesLineItem[],
    total: r.total || 0,
    reason: r.reason || "",
    notes: r.notes || "",
    createdAt: r.created_at,
  };
}

export function mapWorkOrderRow(r: WorkOrderRow): WorkOrder {
  return {
    id: r.id,
    woNumber: r.wo_number,
    productId: r.product_id,
    productName: r.product_name || "",
    qtyToProduce: r.qty_to_produce,
    tailor: r.tailor || "",
    startDate: r.start_date,
    dueDate: r.due_date,
    status: (r.status as WoStatus) || "draft",
    materials: (Array.isArray(r.materials) ? r.materials : []) as unknown as WorkOrderMaterial[],
    laborCostPerPiece: r.labor_cost_per_piece || 0,
    materialCost: r.material_cost,
    wastageCost: r.wastage_cost,
    laborCost: r.labor_cost,
    totalCost: r.total_cost,
    costPerUnit: r.cost_per_unit,
    notes: r.notes || "",
    completedAt: r.completed_at,
    createdAt: r.created_at,
  };
}
