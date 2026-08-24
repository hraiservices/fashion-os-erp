"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Receipt, Search, ArrowUpDown, Copy, Upload, Wallet, Send, Trash2 } from "lucide-react";
import { useSalesInvoices, type SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";
import { useSalesQuotations } from "@/hooks/use-sales-quotations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSetInvoiceDocStatus, useDeleteInvoice } from "@/hooks/use-sales-mutations";
import { useColumnVisibility } from "@/hooks/use-column-visibility";
import { useSavedViews } from "@/hooks/use-saved-views";
import { useRowSelection } from "@/hooks/use-row-selection";
import { inr, fmtDate } from "@/lib/format";
import { invoiceDueBadge, avgDaysToGetPaid, computeInvoiceMargin, DOC_STATUS_LABELS, type DueTone } from "@/lib/sales";
import { computeInvoiceTotals } from "@/lib/invoice-totals";
import { DEFAULT_SALES_WHATSAPP_TEMPLATES, buildSalesWhatsAppUrl, type SalesWhatsAppTemplates } from "@/lib/sales-whatsapp";
import { ExportMenu } from "@/components/ui/export-menu";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { BalanceDue } from "@/components/ui/money-text";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { ColumnCustomizerMenu } from "@/components/ui/column-customizer";
import { SavedViewsMenu } from "@/components/ui/saved-views-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<DueTone, string> = {
  overdue: "text-red-600 dark:text-red-400",
  dueToday: "text-amber-700 dark:text-amber-400",
  dueSoon: "text-amber-700 dark:text-amber-400",
  upcoming: "text-muted-foreground",
  paid: "text-emerald-600 dark:text-emerald-400",
  none: "text-muted-foreground",
};

type SortKey = "date" | "balance";

interface InvoiceViewFilters {
  search: string;
  sortKey: SortKey;
  sortAsc: boolean;
}

const COLUMNS = [
  { key: "date", label: "Date" },
  { key: "customer", label: "Customer", required: true },
  { key: "quote", label: "Quote#" },
  { key: "amount", label: "Amount" },
  { key: "margin", label: "Profit Margin" },
  { key: "balance", label: "Balance" },
  { key: "dueDate", label: "Due Date" },
  { key: "invoiceNumber", label: "Invoice#", required: true },
  { key: "doc", label: "Doc status" },
  { key: "status", label: "Payment status" },
];

function invoiceMargin(inv: SalesInvoiceWithBalance): number | null {
  const { discountAmount } = computeInvoiceTotals(inv.items, inv.shippingCharges, inv.discountType, inv.discountValue, inv.taxRate, inv.gstType);
  return computeInvoiceMargin(inv.items, discountAmount);
}

/** null means cost is unknown for at least one line (a legacy invoice saved before margin was
 *  server-verified) — shown as a muted dash rather than a number that could be mistaken for a
 *  real ₹0 margin. */
function marginText(m: number | null): string {
  return m === null ? "—" : inr(m);
}

export default function SalesInvoicesPage() {
  const { data: invoices, isLoading } = useSalesInvoices();
  const { data: quotes } = useSalesQuotations();
  const { data: user } = useCurrentUser();
  const { data: shop } = useShopSettings();
  const { data: templates } = useAppSetting<SalesWhatsAppTemplates>("salesWhatsAppTemplates", DEFAULT_SALES_WHATSAPP_TEMPLATES);
  const setDocStatus = useSetInvoiceDocStatus();
  const deleteInvoice = useDeleteInvoice();
  const canManage = !!user?.perms.manageSales;
  const canViewMargin = !!user?.perms.viewReports;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const table = useColumnVisibility("sales-invoices", COLUMNS);
  const savedViews = useSavedViews<InvoiceViewFilters>("sales-invoices");

  function reminderUrl(inv: SalesInvoiceWithBalance) {
    const tpl = templates?.paymentReminder || DEFAULT_SALES_WHATSAPP_TEMPLATES.paymentReminder;
    return buildSalesWhatsAppUrl(inv.customerMobile, tpl, {
      name: inv.customerName,
      invoiceNo: inv.invoiceNumber,
      total: inv.total,
      balance: inv.balance,
      dueDate: inv.dueDate,
      shopName: shop?.name,
      shopPhone: shop?.phone,
    });
  }

  function sendPdfUrl(inv: SalesInvoiceWithBalance) {
    const tpl = templates?.sendPdfLink || DEFAULT_SALES_WHATSAPP_TEMPLATES.sendPdfLink;
    return buildSalesWhatsAppUrl(inv.customerMobile, tpl, {
      name: inv.customerName,
      invoiceNo: inv.invoiceNumber,
      total: inv.total,
      balance: inv.balance,
      dueDate: inv.dueDate,
      shopName: shop?.name,
      shopPhone: shop?.phone,
      invoiceLink: typeof window !== "undefined" ? `${window.location.origin}/invoice/view/${inv.shareToken}` : "",
    });
  }

  const quoteNumberById = useMemo(() => new Map((quotes || []).map((q) => [q.id, q.quoteNumber])), [quotes]);

  const summary = useMemo(() => {
    const list = invoices || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);

    let totalOutstanding = 0;
    let dueToday = 0;
    let dueWithin30 = 0;
    let overdue = 0;

    list.forEach((inv) => {
      if (inv.balance <= 0) return;
      totalOutstanding += inv.balance;
      if (!inv.dueDate) return;
      const due = new Date(inv.dueDate);
      due.setHours(0, 0, 0, 0);
      if (due.getTime() < today.getTime()) overdue += inv.balance;
      else if (due.getTime() === today.getTime()) dueToday += inv.balance;
      else if (due.getTime() <= in30.getTime()) dueWithin30 += inv.balance;
    });

    const avgDaysToPay = avgDaysToGetPaid(list);

    return { totalOutstanding, dueToday, dueWithin30, overdue, avgDaysToPay };
  }, [invoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = (invoices || []).filter(
      (inv) => !q || inv.invoiceNumber.toLowerCase().includes(q) || inv.customerName.toLowerCase().includes(q) || inv.customerMobile.includes(q)
    );
    list = [...list].sort((a, b) => {
      const diff = sortKey === "balance" ? a.balance - b.balance : new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime();
      return sortAsc ? diff : -diff;
    });
    return list;
  }, [invoices, search, sortKey, sortAsc]);

  const selection = useRowSelection(filtered.map((i) => i.id));
  const selectedInvoices = filtered.filter((i) => selection.selected.has(i.id));

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function applyView(filters: InvoiceViewFilters) {
    setSearch(filters.search);
    setSortKey(filters.sortKey);
    setSortAsc(filters.sortAsc);
  }

  async function bulkMarkSent() {
    setBulkBusy(true);
    const drafts = selectedInvoices.filter((i) => i.docStatus === "draft");
    try {
      for (const inv of drafts) {
        await setDocStatus.mutateAsync({ id: inv.id, invoiceNumber: inv.invoiceNumber, docStatus: "sent", userEmail: user?.email });
      }
      toast.success(`Marked ${drafts.length} invoice(s) as sent`);
      selection.clear();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    setBulkBusy(true);
    setBulkDeleteOpen(false);
    let failed = 0;
    for (const inv of selectedInvoices) {
      try {
        await deleteInvoice.mutateAsync({ id: inv.id, invoiceNumber: inv.invoiceNumber, userEmail: user?.email });
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    selection.clear();
    if (failed) toast.error(`${selectedInvoices.length - failed} deleted, ${failed} failed`);
    else toast.success(`${selectedInvoices.length} invoice(s) deleted — stock reverted`);
  }

  const bulkExportRows = selectedInvoices.map((inv) => ({
    Invoice: inv.invoiceNumber,
    Date: inv.invoiceDate,
    Customer: inv.customerName,
    Mobile: inv.customerMobile,
    Amount: inv.total,
    Balance: inv.balance,
    DueDate: inv.dueDate || "",
    DocStatus: DOC_STATUS_LABELS[inv.docStatus],
  }));

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Invoices"
        description={`${invoices?.length ?? 0} invoices`}
        actions={
          canManage && (
            <div className="flex gap-2">
              <Button variant="outline" nativeButton={false} render={<Link href="/sales/invoices/import" />}>
                <Upload className="size-4" /> Import
              </Button>
              <Button nativeButton={false} render={<Link href="/sales/invoices/new" />}>
                <Plus className="size-4" /> New invoice
              </Button>
            </div>
          )
        }
      />

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Outstanding" value={inr(summary.totalOutstanding)} icon={Receipt} tone={summary.totalOutstanding > 0 ? "warning" : "default"} />
          <StatCard label="Due Within 30 Days" value={inr(summary.dueWithin30)} icon={Receipt} />
          <StatCard label="Overdue" value={inr(summary.overdue)} icon={Receipt} tone={summary.overdue > 0 ? "danger" : "default"} />
          <StatCard label="Avg. Days to Get Paid" value={summary.avgDaysToPay != null ? `${summary.avgDaysToPay}d` : "—"} icon={Receipt} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative sm:max-w-xs flex-1 min-w-40">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search invoice#, customer, mobile…" className="h-9 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <SavedViewsMenu
          views={savedViews.views}
          onApply={applyView}
          onSave={savedViews.save}
          onRemove={savedViews.remove}
          currentFilters={{ search, sortKey, sortAsc }}
        />
        <ColumnCustomizerMenu table={table} />
      </div>

      {canManage && selection.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selection.count} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={bulkMarkSent} disabled={bulkBusy}>
              <Send className="size-3.5" /> Mark as sent
            </Button>
            <ExportMenu rows={bulkExportRows} filename="invoices_export" disabled={bulkBusy} />
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)} disabled={bulkBusy}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={selection.clear} disabled={bulkBusy}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !invoices || invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Creating an invoice is what deducts sold products from your finished-goods inventory."
          action={
            canManage && (
              <Button nativeButton={false} render={<Link href="/sales/invoices/new" />}>
                <Plus className="size-4" /> New invoice
              </Button>
            )
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No invoices match your search" />
      ) : (
        <div className="hidden overflow-hidden rounded-xl border sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                {canManage && (
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      checked={selection.allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selection.someSelected;
                      }}
                      onChange={selection.toggleAll}
                      aria-label="Select all invoices"
                    />
                  </TableHead>
                )}
                {table.isVisible("date") && <TableHead>Date</TableHead>}
                {table.isVisible("customer") && <TableHead>Customer</TableHead>}
                {table.isVisible("quote") && <TableHead>Quote#</TableHead>}
                {table.isVisible("amount") && <TableHead className="text-right">Amount</TableHead>}
                {table.isVisible("margin") && canViewMargin && <TableHead className="text-right">Profit Margin</TableHead>}
                {table.isVisible("balance") && (
                  <TableHead className="text-right">
                    <button type="button" onClick={() => toggleSort("balance")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Balance <ArrowUpDown className="size-3" />
                    </button>
                  </TableHead>
                )}
                {table.isVisible("dueDate") && <TableHead>Due Date</TableHead>}
                {table.isVisible("invoiceNumber") && <TableHead>Invoice#</TableHead>}
                {table.isVisible("doc") && <TableHead>Doc</TableHead>}
                {table.isVisible("status") && <TableHead>Status</TableHead>}
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => {
                const badge = invoiceDueBadge(inv.dueDate, inv.paymentStatus);
                return (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={() => (window.location.href = `/sales/invoices/${inv.id}`)}>
                    {canManage && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selection.selected.has(inv.id)} onChange={() => selection.toggle(inv.id)} aria-label={`Select invoice ${inv.invoiceNumber}`} />
                      </TableCell>
                    )}
                    {table.isVisible("date") && <TableCell className="text-muted-foreground">{fmtDate(inv.invoiceDate)}</TableCell>}
                    {table.isVisible("customer") && (
                      <TableCell>
                        <p className="font-medium">{inv.customerName}</p>
                        <p className="text-xs text-muted-foreground">{inv.customerMobile}</p>
                      </TableCell>
                    )}
                    {table.isVisible("quote") && <TableCell className="text-muted-foreground">{inv.quoteId ? quoteNumberById.get(inv.quoteId) || "—" : "—"}</TableCell>}
                    {table.isVisible("amount") && <TableCell className="text-right tabular-nums">{inr(inv.total)}</TableCell>}
                    {table.isVisible("margin") && canViewMargin && (
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-medium",
                          invoiceMargin(inv) === null ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        {marginText(invoiceMargin(inv))}
                      </TableCell>
                    )}
                    {table.isVisible("balance") && (
                      <TableCell className="text-right">
                        <BalanceDue amount={inv.balance} paidLabel="" className="block" />
                      </TableCell>
                    )}
                    {table.isVisible("dueDate") && <TableCell className="text-muted-foreground">{inv.dueDate ? fmtDate(inv.dueDate) : "—"}</TableCell>}
                    {table.isVisible("invoiceNumber") && (
                      <TableCell>
                        <Link href={`/sales/invoices/${inv.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                          {inv.invoiceNumber}
                        </Link>
                      </TableCell>
                    )}
                    {table.isVisible("doc") && (
                      <TableCell>
                        <Badge variant="outline">{DOC_STATUS_LABELS[inv.docStatus]}</Badge>
                      </TableCell>
                    )}
                    {table.isVisible("status") && (
                      <TableCell>
                        <span className={cn("text-xs font-medium uppercase tracking-wide", TONE_CLASS[badge.tone])}>{badge.text}</span>
                      </TableCell>
                    )}
                    {canManage && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {inv.balance > 0 && (
                            <Button variant="outline" size="icon-sm" aria-label="Record payment" title="Record payment" nativeButton={false} render={<Link href={`/sales/invoices/${inv.id}/payment`} />}>
                              <Wallet className="size-3.5" />
                            </Button>
                          )}
                          {inv.balance > 0 && <WhatsAppIconButton href={reminderUrl(inv)} label={`WhatsApp reminder to ${inv.customerName}`} />}
                          <WhatsAppIconButton href={sendPdfUrl(inv)} label={`Send PDF link to ${inv.customerName}`} />
                          <Link
                            href={`/sales/invoices/new?cloneId=${inv.id}`}
                            className="inline-flex items-center gap-1 rounded-md p-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Clone invoice"
                            aria-label="Clone invoice"
                          >
                            <Copy className="size-3.5" />
                          </Link>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && invoices && invoices.length > 0 && filtered.length > 0 && (
        <MobileRecordList>
          {filtered.map((inv) => {
            const badge = invoiceDueBadge(inv.dueDate, inv.paymentStatus);
            return (
              <MobileRecordCard key={inv.id} href={`/sales/invoices/${inv.id}`}>
                <MobileRecordHeader
                  title={inv.customerName}
                  subtitle={inv.customerMobile}
                  value={<BalanceDue amount={inv.balance} paidLabel="" />}
                />
                <MobileRecordRow label="Invoice#" value={inv.invoiceNumber} />
                <MobileRecordRow label="Date" value={fmtDate(inv.invoiceDate)} />
                <MobileRecordRow label="Quote#" value={inv.quoteId ? quoteNumberById.get(inv.quoteId) || "—" : "—"} />
                <MobileRecordRow label="Amount" value={inr(inv.total)} />
                {canViewMargin && (
                  <MobileRecordRow
                    label="Profit Margin"
                    value={marginText(invoiceMargin(inv))}
                    valueClassName={invoiceMargin(inv) === null ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400 font-medium"}
                  />
                )}
                <MobileRecordRow label="Due Date" value={inv.dueDate ? fmtDate(inv.dueDate) : "—"} />
                <MobileRecordRow label="Doc" value={<Badge variant="outline">{DOC_STATUS_LABELS[inv.docStatus]}</Badge>} />
                <MobileRecordRow
                  label="Status"
                  value={<span className={cn("text-xs font-medium uppercase tracking-wide", TONE_CLASS[badge.tone])}>{badge.text}</span>}
                />
              </MobileRecordCard>
            );
          })}
        </MobileRecordList>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} invoice(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This reverses the stock each invoice deducted from finished goods, and cannot be undone. Invoices with recorded payments will be skipped — delete those payments first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
