"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { cn, PRESS_FEEDBACK } from "@/lib/utils";
import { inr, fmtDate } from "@/lib/format";
import { PO_STATUS_LABELS, BILL_STATUS_LABELS } from "@/lib/purchases";
import type { PurchaseOrder, VendorPayment } from "@/lib/types";
import type { PurchaseBillWithBalance } from "@/hooks/use-purchase-bills";
import { Badge } from "@/components/ui/badge";
import { BalanceDue } from "@/components/ui/money-text";
import { DateText } from "@/components/ui/date-text";
import { EmptyState } from "@/components/ui/empty-state";
import { FileTextDuotoneIcon, ReceiptDuotoneIcon, WalletDuotoneIcon } from "@/components/icons/duotone-icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { TablePager } from "@/components/ui/table-pager";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { MobileRecordCard, MobileRecordHeader, MobileRecordList, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Button } from "@/components/ui/button";

/** Rows per page in each list. */
const PAGE_SIZE = 10;

type SectionKey = "orders" | "bills" | "payments";
const SECTION_IDS: Record<SectionKey, string> = { orders: "vtx-orders", bills: "vtx-bills", payments: "vtx-payments" };

/**
 * The Transactions block of the vendor page: this vendor's purchase orders, bills and payments
 * as three tables — a "Go to transactions" menu at the top jumps between them, mirroring the
 * same pattern used on the customer page (see `customer-transactions.tsx`). Every list pages ten
 * rows at a time with a Zoho-style pager, sorts by date, and below `sm` turns into a stack of
 * compact cards instead of a table that would scroll sideways on a phone.
 *
 * Payments have no "New" action here: unlike a customer payment, a vendor payment is always
 * recorded against one specific bill (via that bill's own "Record payment" dialog) — there is no
 * vendor-level "pick a bill, then pay" flow, so this section is history-only.
 */
export function VendorTransactions({
  vendorId,
  orders,
  bills,
  payments,
  totalPayable,
  totalPaid,
  canManage,
}: {
  vendorId: string;
  /** Newest first. */
  orders: PurchaseOrder[];
  bills: PurchaseBillWithBalance[];
  payments: VendorPayment[];
  totalPayable: number;
  totalPaid: number;
  canManage: boolean;
}) {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ orders: true, bills: true, payments: true });

  function goTo(key: SectionKey) {
    setOpen((prev) => ({ ...prev, [key]: true }));
    requestAnimationFrame(() => document.getElementById(SECTION_IDS[key])?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="space-y-4">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" className="-ml-2 h-11 gap-1 px-2 text-base font-normal sm:h-9" />}>
          Go to transactions <ChevronDown className="size-4 text-primary" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => goTo("orders")}>Purchase orders ({orders.length})</DropdownMenuItem>
          <DropdownMenuItem onClick={() => goTo("bills")}>Bills ({bills.length})</DropdownMenuItem>
          <DropdownMenuItem onClick={() => goTo("payments")}>Payments ({payments.length})</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OrdersSection
        vendorId={vendorId}
        orders={orders}
        canManage={canManage}
        open={open.orders}
        onToggle={() => setOpen((p) => ({ ...p, orders: !p.orders }))}
      />
      <BillsSection
        vendorId={vendorId}
        bills={bills}
        due={totalPayable}
        canManage={canManage}
        open={open.bills}
        onToggle={() => setOpen((p) => ({ ...p, bills: !p.bills }))}
      />
      <PaymentsSection
        payments={payments}
        totalPaid={totalPaid}
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
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={cn("flex min-h-11 items-center gap-2 text-left sm:min-h-0", PRESS_FEEDBACK)}
        >
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
      <div className={cn("collapsible-rows", open && "is-open")} aria-hidden={!open} inert={!open ? true : undefined}>
        <div className="border-t">{children}</div>
      </div>
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
  if (state.key !== resetKey) {
    setState({ page: 0, key: resetKey });
    page = 0;
  }
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

const linkClass = cn("inline-block font-medium text-primary hover:underline", PRESS_FEEDBACK);

/** Clicking a row opens it, except a click on a link inside it (which navigates by itself). */
function rowNavigate(router: ReturnType<typeof useRouter>, href: string) {
  return (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) return;
    router.push(href);
  };
}

/* ───────────────────────── Purchase orders ───────────────────────── */

type PoFilter = "all" | PurchaseOrder["status"];

function OrdersSection({ vendorId, orders, canManage, open, onToggle }: { vendorId: string; orders: PurchaseOrder[]; canManage: boolean; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<PoFilter>("all");
  const date = useDateSort();
  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);
  const sorted = date.asc ? [...filtered].reverse() : filtered;
  const { page, setPage, slice } = usePaged(sorted, `${filter}-${date.asc}`);

  return (
    <SectionShell
      id={SECTION_IDS.orders}
      title="Purchase orders"
      count={filtered.length}
      open={open}
      onToggle={onToggle}
      controls={
        orders.length > 0 ? (
          <Select value={filter} onValueChange={(v) => v && setFilter(v as PoFilter)}>
            <SelectTrigger className="w-auto gap-1">
              <SelectValue>Status: {filter === "all" ? "All" : PO_STATUS_LABELS[filter]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(Object.keys(PO_STATUS_LABELS) as PurchaseOrder["status"][]).map((k) => (
                <SelectItem key={k} value={k}>
                  {PO_STATUS_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null
      }
      action={canManage ? <NewButton href={`/purchases/orders/new?vendor=${vendorId}`} label="New" /> : null}
    >
      {orders.length === 0 ? (
        <EmptyState icon={FileTextDuotoneIcon} title="No purchase orders yet" className="border-0" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileTextDuotoneIcon} title="No purchase orders match this filter" className="border-0" />
      ) : (
        <>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="date" currentSort={date.sort} onSort={date.toggle}>
                    Date
                  </SortableTableHead>
                  <TableHead>PO #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={rowNavigate(router, `/purchases/orders/${o.id}`)}>
                    <TableCell className="whitespace-nowrap">
                      <DateText>{fmtDate(o.date)}</DateText>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/purchases/orders/${o.id}`} className={linkClass}>
                        {o.poNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{PO_STATUS_LABELS[o.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(o.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <MobileRecordList className="p-3">
            {slice.map((o) => (
              <MobileRecordCard key={o.id} onClick={() => router.push(`/purchases/orders/${o.id}`)}>
                <MobileRecordHeader
                  title={
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-primary">{o.poNumber}</span>
                      <Badge variant="outline">{PO_STATUS_LABELS[o.status]}</Badge>
                    </span>
                  }
                  value={inr(o.total)}
                />
                <MobileRecordRow label="Date" value={<DateText>{fmtDate(o.date)}</DateText>} />
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <TablePager total={sorted.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </SectionShell>
  );
}

/* ────────────────────────────── Bills ────────────────────────────── */

type BillFilter = "all" | PurchaseBillWithBalance["paymentStatus"];

function BillsSection({ vendorId, bills, due, canManage, open, onToggle }: { vendorId: string; bills: PurchaseBillWithBalance[]; due: number; canManage: boolean; open: boolean; onToggle: () => void }) {
  const router = useRouter();
  const [filter, setFilter] = useState<BillFilter>("all");
  const date = useDateSort();
  const filtered = filter === "all" ? bills : bills.filter((b) => b.paymentStatus === filter);
  const sorted = date.asc ? [...filtered].reverse() : filtered;
  const { page, setPage, slice } = usePaged(sorted, `${filter}-${date.asc}`);

  return (
    <SectionShell
      id={SECTION_IDS.bills}
      title="Bills"
      count={filtered.length}
      open={open}
      onToggle={onToggle}
      total={due > 0 ? <span className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">{inr(due)} due</span> : null}
      controls={
        bills.length > 0 ? (
          <Select value={filter} onValueChange={(v) => v && setFilter(v as BillFilter)}>
            <SelectTrigger className="w-auto gap-1">
              <SelectValue>Status: {filter === "all" ? "All" : BILL_STATUS_LABELS[filter]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(Object.keys(BILL_STATUS_LABELS) as PurchaseBillWithBalance["paymentStatus"][]).map((k) => (
                <SelectItem key={k} value={k}>
                  {BILL_STATUS_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null
      }
      action={canManage ? <NewButton href={`/purchases/bills/new?vendor=${vendorId}`} label="New" /> : null}
    >
      {bills.length === 0 ? (
        <EmptyState icon={ReceiptDuotoneIcon} title="No bills yet" className="border-0" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ReceiptDuotoneIcon} title="No bills match this filter" className="border-0" />
      ) : (
        <>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="date" currentSort={date.sort} onSort={date.toggle}>
                    Date
                  </SortableTableHead>
                  <TableHead>Bill #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer" onClick={rowNavigate(router, `/purchases/bills/${b.id}`)}>
                    <TableCell className="whitespace-nowrap">
                      <DateText>{fmtDate(b.billDate)}</DateText>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/purchases/bills/${b.id}`} className={linkClass}>
                        {b.billNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.paymentStatus === "paid" ? "secondary" : "outline"}>{BILL_STATUS_LABELS[b.paymentStatus]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(b.total)}</TableCell>
                    <TableCell className="text-right">
                      <BalanceDue amount={b.balance} suffix="" paidLabel="—" className="text-sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <MobileRecordList className="p-3">
            {slice.map((b) => (
              <MobileRecordCard key={b.id} onClick={() => router.push(`/purchases/bills/${b.id}`)}>
                <MobileRecordHeader
                  title={
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-primary">{b.billNumber}</span>
                      <Badge variant={b.paymentStatus === "paid" ? "secondary" : "outline"}>{BILL_STATUS_LABELS[b.paymentStatus]}</Badge>
                    </span>
                  }
                  value={inr(b.total)}
                />
                <MobileRecordRow label="Date" value={<DateText>{fmtDate(b.billDate)}</DateText>} />
                {b.balance > 0 && <MobileRecordRow label="Balance due" value={inr(b.balance)} valueClassName="text-red-600 dark:text-red-400" />}
              </MobileRecordCard>
            ))}
          </MobileRecordList>

          <TablePager total={sorted.length} page={page} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </SectionShell>
  );
}

/* ──────────────────────────── Payments ───────────────────────────── */

function PaymentsSection({
  payments,
  totalPaid,
  open,
  onToggle,
}: {
  payments: VendorPayment[];
  totalPaid: number;
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
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={rowNavigate(router, `/purchases/bills/${p.billId}`)}>
                    <TableCell className="whitespace-nowrap">
                      <DateText>{fmtDate(p.date)}</DateText>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/purchases/bills/${p.billId}`} className={linkClass}>
                        View bill
                      </Link>
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
              <MobileRecordCard key={p.id} onClick={() => router.push(`/purchases/bills/${p.billId}`)}>
                <MobileRecordHeader title={<span className="text-primary">View bill</span>} subtitle={p.method} value={inr(p.amount)} valueClassName="text-emerald-600 dark:text-emerald-400" />
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
