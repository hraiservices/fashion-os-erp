"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { inr, fmtDate } from "@/lib/format";
import { INVOICE_STATUS_LABELS } from "@/lib/sales";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";
import type { PaymentReceivedRow, PaymentSource } from "@/lib/payments-received";
import type { Order } from "@/lib/types";
import { StageBadge, DueBadge } from "@/components/orders/stage-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateText } from "@/components/ui/date-text";
import { EmptyState } from "@/components/ui/empty-state";
import { ReceiptDuotoneIcon, ShoppingBagDuotoneIcon, WalletDuotoneIcon } from "@/components/icons/duotone-icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { TablePager } from "@/components/ui/table-pager";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { MobileRecordCard, MobileRecordHeader, MobileRecordList, MobileRecordRow } from "@/components/ui/mobile-record-list";

/** Rows per page in each list. */
const PAGE_SIZE = 10;

const PAYMENT_SOURCE_BADGE: Record<PaymentSource, { label: string; className: string }> = {
  invoice: { label: "Invoice", className: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400" },
  stitching: { label: "Stitching", className: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400" },
};

/** Plain coloured text for an invoice's state, like the Status column in Zoho: green when paid, amber part-way, red when nothing is paid. */
const INVOICE_STATUS_TEXT: Record<SalesInvoiceWithBalance["paymentStatus"], string> = {
  paid: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  unpaid: "text-red-600 dark:text-red-400",
};

type SectionKey = "orders" | "invoices" | "payments";
const SECTION_IDS: Record<SectionKey, string> = { orders: "tx-orders", invoices: "tx-invoices", payments: "tx-payments" };

/**
 * The Transactions tab of the customer page: this customer's orders, invoices and payments as
 * three tables — a "Go to transactions" menu at the top jumps between them, and each has a
 * header with its running total, a filter where one makes sense, and a New button. Every list
 * pages ten rows at a time with a Zoho-style pager, sorts by date, and below `sm` turns into a
 * stack of compact cards instead of a table that would scroll sideways on a phone.
 */
export function CustomerTransactions({
  mobile,
  orders,
  invoices,
  payments,
  orderDue,
  invoiceDue,
  totalPaid,
  canRecordPayment,
}: {
  mobile: string;
  /** Newest first. */
  orders: Order[];
  invoices: SalesInvoiceWithBalance[];
  payments: PaymentReceivedRow[];
  orderDue: number;
  invoiceDue: number;
  totalPaid: number;
  canRecordPayment: boolean;
}) {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ orders: true, invoices: true, payments: true });

  function goTo(key: SectionKey) {
    setOpen((prev) => ({ ...prev, [key]: true }));
    // Wait a frame so a section that was collapsed has expanded before we scroll to it.
    requestAnimationFrame(() => document.getElementById(SECTION_IDS[key])?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="space-y-4">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" className="-ml-2 h-11 gap-1 px-2 text-base font-normal sm:h-9" />}>
          Go to transactions <ChevronDown className="size-4 text-primary" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => goTo("orders")}>Orders ({orders.length})</DropdownMenuItem>
          <DropdownMenuItem onClick={() => goTo("invoices")}>Invoices ({invoices.length})</DropdownMenuItem>
          <DropdownMenuItem onClick={() => goTo("payments")}>Payments ({payments.length})</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OrdersSection
        mobile={mobile}
        orders={orders}
        due={orderDue}
        open={open.orders}
        onToggle={() => setOpen((p) => ({ ...p, orders: !p.orders }))}
      />
      <InvoicesSection
        mobile={mobile}
        invoices={invoices}
        due={invoiceDue}
        open={open.invoices}
        onToggle={() => setOpen((p) => ({ ...p, invoices: !p.invoices }))}
      />
      <PaymentsSection
        mobile={mobile}
        payments={payments}
        totalPaid={totalPaid}
        canRecordPayment={canRecordPayment}
        open={open.payments}
        onToggle={() => setOpen((p) => ({ ...p, payments: !p.payments }))}
      />
    </div>
  );
}

/** The card, its header (chevron + title on the left; total, filter and New on the right) and the collapsible body. */
function SectionShell({
  id,
  title,
  count,
  open,
  onToggle,
  total,
  controls,
  action,
  children,
}: {
  id: string;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  total?: React.ReactNode;
  controls?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-muted/30 px-4 py-2.5">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-11 items-center gap-2 text-left sm:min-h-0">
          {open ? <ChevronUp className="size-4 text-primary" /> : <ChevronDown className="size-4 text-primary" />}
          <h2 className="text-sm font-semibold">
            {title} <span className="font-normal text-muted-foreground">({count})</span>
          </h2>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {total}
          {controls}
          {action}
        </div>
      </div>
      {open && <div className="border-t">{children}</div>}
    </section>
  );
}

function NewButton({ href, label }: { href: string; label: string }) {
  return (
    <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href} />} className="h-11 gap-1 px-2 text-primary sm:h-8">
      <Plus className="size-4" /> {label}
    </Button>
  );
}

/** Pages a list and resets to the first page whenever `resetKey` changes (a filter or a sort). */
function usePaged<T>(rows: T[], resetKey: string) {
  const [state, setState] = useState({ page: 0, key: resetKey });
  let page = state.page;
  // Back to the first page when the filter or sort changes. Adjusted during render rather than in
  // an effect, so there is no extra render with the wrong page showing first (React's documented
  // pattern for resetting state when an input changes).
  if (state.key !== resetKey) {
    setState({ page: 0, key: resetKey });
    page = 0;
  }
  // And a clamp for rows that disappear underneath the current page.
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  return {
    page: safePage,
    setPage: (p: number) => setState((s) => ({ ...s, page: p })),
    slice: rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
  };
}

/** Newest-first by default; the Date header toggles it. */
function useDateSort() {
  const [asc, setAsc] = useState(false);
  return { asc, toggle: () => setAsc((v) => !v), sort: { key: "date" as string | null, asc } };
}

const linkClass = "font-medium text-primary hover:underline";

/** Clicking a row opens it, except a click on a link inside it (which navigates by itself). */
function rowNavigate(router: ReturnType<typeof useRouter>, href: string) {
  return (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) return;
    router.push(href);
  };
}

/* ───────────────────────────── Orders ───────────────────────────── */

type OrderFilter = "all" | "new" | "alteration";
const ORDER_FILTER_LABELS: Record<OrderFilter, string> = { all: "All", new: "Stitching", alteration: "Alterations" };

function OrdersSection({ mobile, orders, due, open, onToggle }: { mobile: string; orders: Order[]; due: number; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<OrderFilter>("all");
  const date = useDateSort();
  const filtered = filter === "all" ? orders : orders.filter((o) => o.orderType === filter);
  const sorted = date.asc ? [...filtered].reverse() : filtered;
  const { page, setPage, slice } = usePaged(sorted, `${filter}-${date.asc}`);
  const garments = (o: Order) => (o.garments || []).map((g) => g.type).join(", ") || "—";

  return (
    <SectionShell
      id={SECTION_IDS.orders}
      title="Orders"
      count={filtered.length}
      open={open}
      onToggle={onToggle}
      total={due > 0 ? <span className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">{inr(due)} due</span> : null}
      controls={
        orders.length > 0 ? (
          <Select value={filter} onValueChange={(v) => v && setFilter(v as OrderFilter)}>
            <SelectTrigger className="w-auto gap-1">
              <SelectValue>Type: {ORDER_FILTER_LABELS[filter]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ORDER_FILTER_LABELS) as OrderFilter[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {ORDER_FILTER_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null
      }
      action={<NewButton href={`/orders/new?mobile=${mobile}`} label="New" />}
    >
      {orders.length === 0 ? (
        <EmptyState icon={ReceiptDuotoneIcon} title="No orders yet" className="border-0" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ReceiptDuotoneIcon} title={filter === "alteration" ? "No alterations yet" : "No stitching orders yet"} className="border-0" />
      ) : (
        <>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="date" currentSort={date.sort} onSort={date.toggle}>
                    Date
                  </SortableTableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Garments</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={rowNavigate(router, `/orders/${o.id}`)}>
                    <TableCell className="whitespace-nowrap">
                      <DateText>{fmtDate(o.inDate)}</DateText>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/orders/${o.id}`} className={linkClass}>
                        {o.id}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">{garments(o)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <DateText>{o.deliveryDate ? fmtDate(o.deliveryDate) : "—"}</DateText>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StageBadge stage={o.status} size="sm" />
                        <DueBadge order={o} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(o.total)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", o.balance > 0 ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{inr(o.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <MobileRecordList className="p-3">
            {slice.map((o) => (
              <MobileRecordCard key={o.id} onClick={() => router.push(`/orders/${o.id}`)}>
                <MobileRecordHeader
                  title={
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-primary">{o.id}</span>
                      <StageBadge stage={o.status} size="sm" />
                    </span>
                  }
                  subtitle={garments(o)}
                  value={inr(o.total)}
                />
                <MobileRecordRow label="Date" value={<DateText>{fmtDate(o.inDate)}</DateText>} />
                {o.deliveryDate && <MobileRecordRow label="Delivery" value={<DateText>{fmtDate(o.deliveryDate)}</DateText>} />}
                {o.balance > 0 && <MobileRecordRow label="Balance due" value={inr(o.balance)} valueClassName="text-red-600 dark:text-red-400" />}
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <TablePager total={sorted.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </SectionShell>
  );
}

/* ──────────────────────────── Invoices ──────────────────────────── */

type InvoiceFilter = "all" | SalesInvoiceWithBalance["paymentStatus"];
const INVOICE_FILTER_LABELS: Record<InvoiceFilter, string> = { all: "All", paid: "Paid", partial: "Partially paid", unpaid: "Unpaid" };

function InvoicesSection({ mobile, invoices, due, open, onToggle }: { mobile: string; invoices: SalesInvoiceWithBalance[]; due: number; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const date = useDateSort();
  const filtered = filter === "all" ? invoices : invoices.filter((i) => i.paymentStatus === filter);
  const sorted = date.asc ? [...filtered].reverse() : filtered;
  const { page, setPage, slice } = usePaged(sorted, `${filter}-${date.asc}`);
  const items = (i: SalesInvoiceWithBalance) => i.items.map((it) => it.productName).join(", ") || "—";

  return (
    <SectionShell
      id={SECTION_IDS.invoices}
      title="Invoices"
      count={filtered.length}
      open={open}
      onToggle={onToggle}
      total={due > 0 ? <span className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">{inr(due)} due</span> : null}
      controls={
        invoices.length > 0 ? (
          <Select value={filter} onValueChange={(v) => v && setFilter(v as InvoiceFilter)}>
            <SelectTrigger className="w-auto gap-1">
              <SelectValue>Status: {INVOICE_FILTER_LABELS[filter]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(INVOICE_FILTER_LABELS) as InvoiceFilter[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {INVOICE_FILTER_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null
      }
      action={<NewButton href={`/sales/invoices/new?mobile=${mobile}`} label="New" />}
    >
      {invoices.length === 0 ? (
        <EmptyState icon={ShoppingBagDuotoneIcon} title="No invoices yet" description="Products bought by this customer will appear here." className="border-0" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ShoppingBagDuotoneIcon} title="No invoices match this filter" className="border-0" />
      ) : (
        <>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="date" currentSort={date.sort} onSort={date.toggle}>
                    Date
                  </SortableTableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.map((inv) => (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={rowNavigate(router, `/sales/invoices/${inv.id}`)}>
                    <TableCell className="whitespace-nowrap">
                      <DateText>{fmtDate(inv.invoiceDate)}</DateText>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/sales/invoices/${inv.id}`} className={linkClass}>
                        {inv.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">{items(inv)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(inv.total)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", inv.balance > 0 ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{inr(inv.balance)}</TableCell>
                    <TableCell className={cn("whitespace-nowrap text-sm font-medium", INVOICE_STATUS_TEXT[inv.paymentStatus])}>{INVOICE_STATUS_LABELS[inv.paymentStatus]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <MobileRecordList className="p-3">
            {slice.map((inv) => (
              <MobileRecordCard key={inv.id} onClick={() => router.push(`/sales/invoices/${inv.id}`)}>
                <MobileRecordHeader title={<span className="text-primary">{inv.invoiceNumber}</span>} subtitle={items(inv)} value={inr(inv.total)} />
                <MobileRecordRow label="Date" value={<DateText>{fmtDate(inv.invoiceDate)}</DateText>} />
                <MobileRecordRow label="Status" value={INVOICE_STATUS_LABELS[inv.paymentStatus]} valueClassName={INVOICE_STATUS_TEXT[inv.paymentStatus]} />
                {inv.balance > 0 && <MobileRecordRow label="Balance due" value={inr(inv.balance)} valueClassName="text-red-600 dark:text-red-400" />}
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <TablePager total={sorted.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </SectionShell>
  );
}

/* ──────────────────────────── Payments ──────────────────────────── */

function PaymentsSection({
  mobile,
  payments,
  totalPaid,
  canRecordPayment,
  open,
  onToggle,
}: {
  mobile: string;
  payments: PaymentReceivedRow[];
  totalPaid: number;
  canRecordPayment: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const date = useDateSort();
  const sorted = date.asc ? [...payments].reverse() : payments;
  const { page, setPage, slice } = usePaged(sorted, String(date.asc));

  return (
    <SectionShell
      id={SECTION_IDS.payments}
      title="Payments"
      count={payments.length}
      open={open}
      onToggle={onToggle}
      total={totalPaid > 0 ? <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{inr(totalPaid)}</span> : null}
      action={canRecordPayment ? <NewButton href={`/payments/new?customer=${encodeURIComponent(mobile)}`} label="New" /> : null}
    >
      {payments.length === 0 ? (
        <EmptyState icon={WalletDuotoneIcon} title="No payments recorded yet" className="border-0" />
      ) : (
        <>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="date" currentSort={date.sort} onSort={date.toggle}>
                    Date
                  </SortableTableHead>
                  <TableHead>Against</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={rowNavigate(router, p.referenceHref)}>
                    <TableCell className="whitespace-nowrap">
                      <DateText>{fmtDate(p.date)}</DateText>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={p.referenceHref} className={linkClass}>
                        {p.reference}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={PAYMENT_SOURCE_BADGE[p.source].className}>
                        {PAYMENT_SOURCE_BADGE[p.source].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.method}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{inr(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <MobileRecordList className="p-3">
            {slice.map((p) => (
              <MobileRecordCard key={p.id} onClick={() => router.push(p.referenceHref)}>
                <MobileRecordHeader
                  title={
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-primary">{p.reference}</span>
                      <Badge variant="outline" className={PAYMENT_SOURCE_BADGE[p.source].className}>
                        {PAYMENT_SOURCE_BADGE[p.source].label}
                      </Badge>
                    </span>
                  }
                  subtitle={p.method}
                  value={inr(p.amount)}
                  valueClassName="text-emerald-600 dark:text-emerald-400"
                />
                <MobileRecordRow label="Date" value={<DateText>{fmtDate(p.date)}</DateText>} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <TablePager total={sorted.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </SectionShell>
  );
}
