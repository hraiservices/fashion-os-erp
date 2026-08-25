import type { Database, Json } from "@/lib/supabase/database.types";
import { deriveBalance, type Stage } from "@/lib/business-rules";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderExpenseRow = Database["public"]["Tables"]["order_expenses"]["Row"];
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

export interface ExpenseCategoryItem {
  name: string;
  subcategories: string[];
}

/** Converts the stored setting (may be old flat string[] or new ExpenseCategoryItem[]) into the typed shape. */
export function normalizeExpenseCategories(raw: unknown): ExpenseCategoryItem[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0)
    return (EXPENSE_CATEGORIES as unknown as string[]).map((name) => ({ name, subcategories: [] }));
  if (typeof raw[0] === "string")
    return (raw as string[]).map((name) => ({ name, subcategories: [] }));
  return raw as ExpenseCategoryItem[];
}

export type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export interface Garment {
  type: string;
  lining?: "s" | "h" | "f" | string;
  no?: number;
  amount?: number;
  /** Stable per-garment id, generated client-side once and carried through every edit —
   *  what preserve_garment_payables() matches on to keep a frozen payableAmount attached to
   *  the correct garment even if lines are reordered or one is deleted. Absent on garments
   *  created before this existed (the SQL falls back to positional matching for those). */
  lineId?: string;
  /** Employee id of whoever stitches this garment — drives tailor piece-rate pay. */
  tailor?: string;
  /** Snapshotted from the tailor rate card the moment this garment's order first reaches
   *  "ready", then frozen forever — never recalculated, even if the rate card or the order
   *  changes afterward. Undefined until snapshotted (no tailor assigned, or not ready yet). */
  payableAmount?: number;
  [key: string]: Json | undefined;
}

export interface Order {
  id: string;
  name: string;
  mobile: string;
  inDate: string;
  deliveryDate: string;
  /** "HH:mm" 24h local time, or "" when not captured — treat as end-of-day (matches legacy rows). */
  inTime: string;
  deliveryTime: string;
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
  orderType: OrderType;
  /** How the customer found the shop — Walk-in/Referral/etc. Empty string = not recorded (orders created before this field existed). */
  bookingSource: string;
  /** Internal-only cost fields, never shown to the customer — power the order-profitability report. */
  fabricCost: number;
  otherCost: number;
  reworkFlag: boolean;
  reworkReason: string;
  reworkFlaggedBy: string | null;
  reworkFlaggedAt: string | null;
  /** Set once, the first time the order reaches "ready" — powers the ready-but-uncollected aging report. Null for orders that haven't reached ready yet, or that reached it before this column existed. */
  readyAt: string | null;
  /** Set by a payroll manager to confirm this order's snapshotted tailor payables as real —
   *  see /api/orders/[id]/confirm-payables. Only confirmed payables count toward payroll. */
  payablesConfirmedAt: string | null;
  payablesConfirmedBy: string | null;
  createdAt: string;
}

export type OrderType = "new" | "alteration";

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
    inTime: r.in_time || "",
    deliveryTime: r.delivery_time || "",
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
    orderType: (r.order_type === "alteration" ? "alteration" : "new") as OrderType,
    bookingSource: r.booking_source || "",
    fabricCost: r.fabric_cost || 0,
    otherCost: r.other_cost || 0,
    reworkFlag: !!r.rework_flag,
    reworkReason: r.rework_reason || "",
    reworkFlaggedBy: r.rework_flagged_by ?? null,
    reworkFlaggedAt: r.rework_flagged_at ?? null,
    readyAt: r.ready_at ?? null,
    payablesConfirmedAt: r.payables_confirmed_at ?? null,
    payablesConfirmedBy: r.payables_confirmed_by ?? null,
    createdAt: r.created_at || "",
  };
}

/** A stitching-order line-item cost (lining, thread, buttons, electricity, ...) — see
 *  supabase/migrations/add_order_expenses.sql. `amount` is always authoritative; qty/unit/rate
 *  are only present for expenses entered as qty*rate rather than a flat figure. */
export interface OrderExpense {
  id: string;
  orderId: string;
  category: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  amount: number;
  createdBy: string | null;
  createdAt: string;
}

export function mapOrderExpenseRow(r: OrderExpenseRow): OrderExpense {
  return {
    id: r.id,
    orderId: r.order_id,
    category: r.category || "",
    qty: r.qty,
    unit: r.unit,
    rate: r.rate,
    amount: r.amount || 0,
    createdBy: r.created_by,
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
  tags: string[];
  gstin: string;
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
    tags: Array.isArray(r.tags) ? r.tags : [],
    gstin: r.gstin || "",
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
  barcode: string | null;
  /** Structured variant attributes for Customer Purchase Intelligence matching — each is one
   *  value from its fixed vocabulary in lib/product-attributes.ts, or "" if not tagged. */
  size: string;
  color: string;
  fabric: string;
  pattern: string;
  occasion: string;
  /** Free text — vendor/brand names have no bounded vocabulary. */
  brand: string;
  /** Resized JPEG data URL (see fileToDataUrl) — same inline-storage pattern as branding images. */
  imageDataUrl: string | null;
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
    barcode: r.barcode,
    size: r.size || "",
    color: r.color || "",
    fabric: r.fabric || "",
    pattern: r.pattern || "",
    occasion: r.occasion || "",
    brand: r.brand || "",
    imageDataUrl: r.image_data_url || null,
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
  warehouseId: string | null;
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
    warehouseId: r.warehouse_id ?? null,
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
  /** Set once a payroll manager confirms this WO's laborCost as a real tailor payable — see
   *  the split-gate note on the /complete and /confirm-payable routes. Null until confirmed,
   *  even after the WO itself is completed. */
  laborPayableConfirmedAt: string | null;
  laborPayableConfirmedBy: string | null;
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
  posSessionId: string | null;
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
    posSessionId: r.pos_session_id,
    createdAt: r.created_at,
  };
}

export type PosSessionRow = Database["public"]["Tables"]["pos_sessions"]["Row"];
export type PosSessionStatus = "open" | "closed";

export interface PosSession {
  id: string;
  openedBy: string | null;
  openedAt: string;
  openingCash: number;
  closedAt: string | null;
  closingCash: number | null;
  expectedCash: number | null;
  status: PosSessionStatus;
  notes: string;
}

export function mapPosSessionRow(r: PosSessionRow): PosSession {
  return {
    id: r.id,
    openedBy: r.opened_by,
    openedAt: r.opened_at,
    openingCash: r.opening_cash || 0,
    closedAt: r.closed_at,
    closingCash: r.closing_cash,
    expectedCash: r.expected_cash,
    status: (r.status as PosSessionStatus) || "open",
    notes: r.notes || "",
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
    laborPayableConfirmedAt: r.labor_payable_confirmed_at ?? null,
    laborPayableConfirmedBy: r.labor_payable_confirmed_by ?? null,
    createdAt: r.created_at,
  };
}

export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
export type AttendanceRow = Database["public"]["Tables"]["employee_attendance"]["Row"];

export type CommissionType = "none" | "percent_of_sales" | "flat_per_order";
export type AttendanceStatus = "present" | "absent" | "half_day" | "leave";
export type SalaryType = "monthly" | "daily" | "hourly";

export interface Employee {
  id: string;
  name: string;
  mobile: string;
  role: string;
  employmentType: string;
  commissionType: CommissionType;
  commissionRate: number;
  active: boolean;
  joinedDate: string | null;
  notes: string;
  salaryType: SalaryType;
  salaryRate: number;
  /** Whether this employee also earns per-garment/per-unit piece-rate pay on top of their
   *  salary — see src/lib/piece-rate.ts. Salary can be ₹0 for a pure piece-rate tailor. */
  pieceRateEligible: boolean;
  /** Assigned shop location for geofenced self-check-in — null if not assigned/single-location shop. */
  locationId: string | null;
  /** Whether a PIN has been set for self-service attendance login. The hash itself is never
   *  sent to the client — this is derived server-side (pin_hash != null) so the UI can show
   *  "PIN set" without ever seeing the hash. */
  hasPin: boolean;
  /** Reporting manager (another employee's id) — org-structure data, not yet used to scope
   *  approval visibility (see leave management plan notes). */
  managerId: string | null;
  createdAt: string;
}

/** Deliberately does NOT select pin_hash — see use-employees.ts. `hasPin` must be computed by
 *  the caller (server-side) and passed in; defaults to false for any caller that omits it. */
export function mapEmployeeRow(r: EmployeeRow, hasPin = false): Employee {
  return {
    id: r.id,
    name: r.name || "",
    mobile: r.mobile || "",
    role: r.role || "",
    employmentType: r.employment_type || "full_time",
    commissionType: (r.commission_type as CommissionType) || "none",
    commissionRate: r.commission_rate || 0,
    active: r.active,
    joinedDate: r.joined_date,
    notes: r.notes || "",
    salaryType: (r.salary_type as SalaryType) || "monthly",
    salaryRate: r.salary_rate || 0,
    pieceRateEligible: !!r.piece_rate_eligible,
    locationId: r.location_id ?? null,
    hasPin,
    managerId: r.manager_id ?? null,
    createdAt: r.created_at,
  };
}

export type ShopLocationRow = Database["public"]["Tables"]["shop_locations"]["Row"];

export interface ShopLocation {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  active: boolean;
  createdAt: string;
}

export function mapShopLocationRow(r: ShopLocationRow): ShopLocation {
  return {
    id: r.id,
    name: r.name || "",
    address: r.address || "",
    latitude: r.latitude,
    longitude: r.longitude,
    geofenceRadiusM: r.geofence_radius_m ?? 200,
    active: r.active,
    createdAt: r.created_at,
  };
}

export type EmployeeAdvanceRow = Database["public"]["Tables"]["employee_advances"]["Row"];

export interface EmployeeAdvance {
  id: string;
  employeeId: string;
  date: string;
  amount: number;
  note: string;
  payslipId: string | null;
  createdAt: string;
}

export function mapEmployeeAdvanceRow(r: EmployeeAdvanceRow): EmployeeAdvance {
  return {
    id: r.id,
    employeeId: r.employee_id,
    date: r.date,
    amount: r.amount || 0,
    note: r.note || "",
    payslipId: r.payslip_id,
    createdAt: r.created_at,
  };
}

export type LeaveTypeRow = Database["public"]["Tables"]["leave_types"]["Row"];

export interface LeaveType {
  id: string;
  name: string;
  annualDays: number;
  paid: boolean;
  carryForward: boolean;
  maxCarryForwardDays: number | null;
  active: boolean;
  createdAt: string;
}

export function mapLeaveTypeRow(r: LeaveTypeRow): LeaveType {
  return {
    id: r.id,
    name: r.name || "",
    annualDays: r.annual_days || 0,
    paid: r.paid,
    carryForward: r.carry_forward,
    maxCarryForwardDays: r.max_carry_forward_days,
    active: r.active,
    createdAt: r.created_at,
  };
}

export type HolidayRow = Database["public"]["Tables"]["holidays"]["Row"];

export interface Holiday {
  id: string;
  name: string;
  date: string;
  active: boolean;
  createdAt: string;
}

export function mapHolidayRow(r: HolidayRow): Holiday {
  return { id: r.id, name: r.name || "", date: r.date, active: r.active, createdAt: r.created_at };
}

export type LeaveBalanceAdjustmentRow = Database["public"]["Tables"]["leave_balance_adjustments"]["Row"];

export interface LeaveBalanceAdjustment {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  days: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export function mapLeaveBalanceAdjustmentRow(r: LeaveBalanceAdjustmentRow): LeaveBalanceAdjustment {
  return {
    id: r.id,
    employeeId: r.employee_id,
    leaveTypeId: r.leave_type_id,
    year: r.year,
    days: r.days || 0,
    reason: r.reason || "",
    createdBy: r.created_by || "",
    createdAt: r.created_at,
  };
}

/** Computed balance for one employee/leave-type/year — "used" is always derived from approved
 *  leave_requests, never a stored counter (same principle as order.balance). */
export interface LeaveBalanceSummary {
  leaveTypeId: string;
  leaveTypeName: string;
  paid: boolean;
  allocated: number;
  carriedForward: number;
  adjusted: number;
  used: number;
  remaining: number;
}

export type LeaveRequestRow = Database["public"]["Tables"]["leave_requests"]["Row"];
export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  days: number;
  reason: string;
  status: LeaveRequestStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
}

export function mapLeaveRequestRow(r: LeaveRequestRow): LeaveRequest {
  return {
    id: r.id,
    employeeId: r.employee_id,
    leaveTypeId: r.leave_type_id,
    fromDate: r.from_date,
    toDate: r.to_date,
    halfDay: r.half_day,
    days: r.days || 0,
    reason: r.reason || "",
    status: (r.status as LeaveRequestStatus) || "pending",
    requestedBy: r.requested_by || "",
    requestedAt: r.requested_at || "",
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    rejectionReason: r.rejection_reason,
  };
}

export type ReferralCouponRow = Database["public"]["Tables"]["referral_coupons"]["Row"];

export interface ReferralCoupon {
  id: string;
  code: string;
  referrerMobile: string;
  referrerName: string;
  discountAmount: number;
  issuedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedOrderId: string | null;
  createdBy: string | null;
}

export function mapReferralCouponRow(r: ReferralCouponRow): ReferralCoupon {
  return {
    id: r.id,
    code: r.code,
    referrerMobile: r.referrer_mobile,
    referrerName: r.referrer_name || "",
    discountAmount: r.discount_amount || 0,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    redeemedAt: r.redeemed_at,
    redeemedOrderId: r.redeemed_order_id,
    createdBy: r.created_by,
  };
}

export type PayrollRunRow = Database["public"]["Tables"]["payroll_runs"]["Row"];
export type PayrollRunStatus = "draft" | "finalized";

export interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  createdAt: string;
  finalizedAt: string | null;
  notes: string;
}

export function mapPayrollRunRow(r: PayrollRunRow): PayrollRun {
  return {
    id: r.id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    status: (r.status as PayrollRunStatus) || "draft",
    createdAt: r.created_at,
    finalizedAt: r.finalized_at,
    notes: r.notes || "",
  };
}

export type PayslipRow = Database["public"]["Tables"]["payslips"]["Row"];
export type PayslipStatus = "draft" | "paid";

export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  grossPay: number;
  pieceRatePay: number;
  deductions: number;
  netPay: number;
  hoursWorked: number;
  overtimeHours: number;
  overtimePay: number;
  status: PayslipStatus;
  paidAt: string | null;
  notes: string;
}

export function mapPayslipRow(r: PayslipRow): Payslip {
  return {
    id: r.id,
    payrollRunId: r.payroll_run_id,
    employeeId: r.employee_id,
    presentDays: r.present_days || 0,
    absentDays: r.absent_days || 0,
    halfDays: r.half_days || 0,
    leaveDays: r.leave_days || 0,
    grossPay: r.gross_pay || 0,
    pieceRatePay: r.piece_rate_pay || 0,
    deductions: r.deductions || 0,
    netPay: r.net_pay || 0,
    hoursWorked: r.hours_worked || 0,
    overtimeHours: r.overtime_hours || 0,
    overtimePay: r.overtime_pay || 0,
    status: (r.status as PayslipStatus) || "draft",
    paidAt: r.paid_at,
    notes: r.notes || "",
  };
}

export type AttendanceSource = "manual" | "self_service";

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  /** Legacy plain-time fields — still written by manager-marked (source="manual") rows. */
  checkIn: string | null;
  checkOut: string | null;
  notes: string;
  createdAt: string;
  /** "self_service" rows come from the employee's own PIN check-in/out (checkin/route.ts) and
   *  carry the fields below; "manual" rows (the existing attendance register) don't. */
  source: AttendanceSource;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkInAccuracyM: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkOutAccuracyM: number | null;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  checkInWithinGeofence: boolean | null;
  checkOutWithinGeofence: boolean | null;
  checkInDistanceM: number | null;
  checkOutDistanceM: number | null;
  hoursWorked: number | null;
  overtimeHours: number;
}

export function mapAttendanceRow(r: AttendanceRow): Attendance {
  return {
    id: r.id,
    employeeId: r.employee_id,
    date: r.date,
    status: (r.status as AttendanceStatus) || "present",
    checkIn: r.check_in,
    checkOut: r.check_out,
    notes: r.notes || "",
    createdAt: r.created_at,
    source: (r.source as AttendanceSource) || "manual",
    checkInAt: r.check_in_at,
    checkOutAt: r.check_out_at,
    checkInLat: r.check_in_lat,
    checkInLng: r.check_in_lng,
    checkInAccuracyM: r.check_in_accuracy_m,
    checkOutLat: r.check_out_lat,
    checkOutLng: r.check_out_lng,
    checkOutAccuracyM: r.check_out_accuracy_m,
    checkInPhoto: r.check_in_photo,
    checkOutPhoto: r.check_out_photo,
    checkInWithinGeofence: r.check_in_within_geofence,
    checkOutWithinGeofence: r.check_out_within_geofence,
    checkInDistanceM: r.check_in_distance_m,
    checkOutDistanceM: r.check_out_distance_m,
    hoursWorked: r.hours_worked,
    overtimeHours: r.overtime_hours || 0,
  };
}

export type WarehouseRow = Database["public"]["Tables"]["warehouses"]["Row"];

export interface Warehouse {
  id: string;
  name: string;
  address: string;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
}

export function mapWarehouseRow(r: WarehouseRow): Warehouse {
  return {
    id: r.id,
    name: r.name || "",
    address: r.address || "",
    isDefault: r.is_default,
    active: r.active,
    createdAt: r.created_at,
  };
}
