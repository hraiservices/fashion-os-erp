"use client";

import { DateText } from "@/components/ui/date-text";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Search, Truck, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceDue } from "@/components/ui/money-text";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { useVendors } from "@/hooks/use-vendors";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRecordVendorPayment } from "@/hooks/use-purchase-mutations";
import { useVendorCredit, useIssueVendorCredit, useRedeemVendorCredit } from "@/hooks/use-vendor-credit";
import { istDateString } from "@/lib/ist-date";
import { inr, fmtDate } from "@/lib/format";

/** Same method list record-vendor-payment-dialog.tsx uses for a single bill — kept identical so
 *  a payment recorded here looks no different from one recorded off a bill's own page. */
const METHODS = ["Cash", "UPI", "Bank Transfer", "Cheque", "Card"];

interface BillRow {
  id: string;
  billNumber: string;
  billDate: string;
  total: number;
  due: number;
}

function distributeOldestFirst(rows: BillRow[], pool: number): Record<string, number> {
  const result: Record<string, number> = {};
  let remaining = Math.max(0, pool);
  for (const row of rows) {
    const alloc = Math.round(Math.min(row.due, remaining) * 100) / 100;
    remaining = Math.round((remaining - alloc) * 100) / 100;
    result[row.id] = alloc;
  }
  return result;
}

/**
 * The vendor-side mirror of RecordPaymentForm (src/components/payments/record-payment-form.tsx):
 * search/select a vendor, see every one of their open bills, enter one lump "Amount paid" that
 * auto-allocates oldest-bill-first across as many bills as it covers (still hand-editable per
 * row), and submit. Unlike the customer form there's no discount concept on the purchases side
 * and no "deposit to" account selector — record-vendor-payment-dialog.tsx (the existing
 * single-bill flow this supersedes for the multi-bill case) has neither either. Any amount paid
 * beyond what the selected bills need is saved as vendor credit
 * (supabase/migrations/add_vendor_credit_ledger.sql), redeemable here later the same way
 * customer credit works.
 */
export function VendorPaymentForm({ initialVendorId }: { initialVendorId?: string }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: vendors } = useVendors();
  const { data: allBills } = usePurchaseBills();
  const recordPayment = useRecordVendorPayment();
  const issueCredit = useIssueVendorCredit();
  const redeemCredit = useRedeemVendorCredit();

  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(initialVendorId ?? null);
  const [query, setQuery] = useState("");
  const [date, setDate] = useState(istDateString());
  const [method, setMethod] = useState(METHODS[0]);
  const [note, setNote] = useState("");
  const [cashAmount, setCashAmount] = useState(0);
  const [creditToApply, setCreditToApply] = useState(0);
  const [rowPayments, setRowPayments] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const saving = progress !== null;

  const { data: availableCredit } = useVendorCredit(selectedVendorId);

  const payableByVendor = useMemo(() => {
    const map = new Map<string, number>();
    (allBills || []).forEach((b) => map.set(b.vendorId, (map.get(b.vendorId) || 0) + b.balance));
    return map;
  }, [allBills]);

  const vendorResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (vendors || [])
      .map((v) => ({ id: v.id, name: v.name, mobile: v.mobile, due: payableByVendor.get(v.id) || 0 }))
      .filter((v) => v.due > 0)
      .filter((v) => !q || v.name.toLowerCase().includes(q) || v.mobile.includes(q))
      .sort((a, b) => b.due - a.due);
  }, [vendors, payableByVendor, query]);

  const selectedVendor = selectedVendorId ? (vendors || []).find((v) => v.id === selectedVendorId) : undefined;

  const rows: BillRow[] = useMemo(() => {
    if (!selectedVendorId) return [];
    return (allBills || [])
      .filter((b) => b.vendorId === selectedVendorId && b.balance > 0)
      .map((b) => ({ id: b.id, billNumber: b.billNumber, billDate: b.billDate, total: b.total, due: b.balance }))
      .sort((a, b) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime());
  }, [selectedVendorId, allBills]);

  const totalDue = rows.reduce((s, r) => s + r.due, 0);
  const pool = cashAmount + creditToApply;
  const appliedToDues = rows.reduce((s, r) => s + Math.min(rowPayments[r.id] || 0, r.due), 0);
  const excess = Math.max(0, Math.round((pool - appliedToDues) * 100) / 100);

  function redistribute(newCash: number, newCredit: number) {
    setRowPayments(distributeOldestFirst(rows, newCash + newCredit));
  }

  function setCash(v: number) {
    const next = Math.max(0, v);
    setCashAmount(next);
    redistribute(next, creditToApply);
  }

  function setCredit(v: number) {
    const next = Math.max(0, Math.min(v, availableCredit || 0));
    setCreditToApply(next);
    redistribute(cashAmount, next);
  }

  function setRowAmount(id: string, due: number, value: number) {
    setRowPayments((prev) => ({ ...prev, [id]: Math.max(0, Math.min(value, due)) }));
  }

  function payRowInFull(row: BillRow) {
    const prevAlloc = rowPayments[row.id] || 0;
    const delta = Math.round((row.due - prevAlloc) * 100) / 100;
    setRowPayments((prev) => ({ ...prev, [row.id]: row.due }));
    setCashAmount((prev) => Math.max(0, Math.round((prev + delta) * 100) / 100));
  }

  function payAllInFull() {
    setCash(Math.max(0, Math.round((totalDue - creditToApply) * 100) / 100));
  }

  function clearApplied() {
    setRowPayments({});
  }

  async function save() {
    const toApply = rows.filter((r) => (rowPayments[r.id] || 0) > 0);
    if (toApply.length === 0 && excess <= 0) {
      toast.error("Enter an amount paid, or a payment amount for at least one bill");
      return;
    }
    if (!selectedVendorId || !selectedVendor) return;

    // Same independent-writes-in-parallel approach as RecordPaymentForm — each bill's payment is
    // its own row, so there's no reason to serialize them behind one another's round trip.
    setProgress({ done: 0, total: toApply.length });
    let done = 0;
    const results = await Promise.allSettled(
      toApply.map(async (row) => {
        const amt = Math.min(rowPayments[row.id] || 0, row.due);
        await recordPayment.mutateAsync({
          billId: row.id, vendorId: selectedVendorId, billNumber: row.billNumber, amount: amt, method, date, note, userEmail: user?.email,
        });
        done += 1;
        setProgress({ done, total: toApply.length });
      })
    );

    const failed = results.flatMap((r, i) => (r.status === "rejected" ? [{ row: toApply[i], reason: r.reason }] : []));
    const succeeded = toApply.length - failed.length;
    if (failed.length > 0) {
      toast.error(
        `${succeeded} of ${toApply.length} payments recorded. Failed: ${failed.map((f) => `${f.row.billNumber} (${f.reason instanceof Error ? f.reason.message : "Payment failed"})`).join(", ")}.` +
          (succeeded > 0 ? " Credit wasn't applied — retry the failed bills, then submit again." : ""),
        { duration: 12000 }
      );
      setProgress(null);
      return;
    }

    try {
      if (creditToApply > 0) {
        await redeemCredit.mutateAsync({ vendorId: selectedVendorId, amount: creditToApply, note: `Applied to payment on ${date}` });
      }
      if (excess > 0) {
        await issueCredit.mutateAsync({ vendorId: selectedVendorId, amount: excess, note: `Excess from payment on ${date}` });
      }
    } catch (e) {
      toast.error(`Payment recorded, but the credit ledger update failed: ${e instanceof Error ? e.message : "Unknown error"}. Please correct it manually.`);
      setProgress(null);
      router.push(`/purchases/vendors/${selectedVendorId}`);
      return;
    }

    const parts = [toApply.length > 0 ? `${toApply.length} bill${toApply.length === 1 ? "" : "s"}` : null, excess > 0 ? `${inr(excess)} saved as credit` : null].filter(Boolean);
    toast.success(`Payment recorded — ${parts.join(", ")}`);
    setProgress(null);
    router.push(`/purchases/vendors/${selectedVendorId}`);
  }

  if (!selectedVendorId) {
    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus placeholder="Search by name or mobile…" className="h-10 pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {vendorResults.length === 0 ? (
          <EmptyState icon={Truck} title={query ? `No results for "${query}"` : "All bills paid"} description={query ? undefined : "No vendor has an outstanding balance."} />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border">
            {vendorResults.map((v) => (
              <li key={v.id}>
                <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50" onClick={() => setSelectedVendorId(v.id)}>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {v.name.trim().charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{v.mobile}</p>
                  </div>
                  <BalanceDue amount={v.due} paidLabel={inr(v.due)} className="shrink-0 text-sm font-semibold" />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!initialVendorId && (
        <button type="button" onClick={() => setSelectedVendorId(null)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Change vendor
        </button>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-lg font-semibold">{selectedVendor?.name || selectedVendorId}</p>
          <p className="text-sm text-muted-foreground">{selectedVendor?.mobile}</p>
        </div>
        {totalDue > 0 && (
          <p className="text-right">
            <span className="block text-xs text-muted-foreground">Total payable</span>
            <BalanceDue amount={totalDue} paidLabel={inr(totalDue)} className="text-lg font-semibold" />
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Amount paid</Label>
            {totalDue > 0 && (
              <button type="button" onClick={payAllInFull} className="text-xs text-primary hover:underline">
                Pay in full
              </button>
            )}
          </div>
          <NumberInput min={0} value={cashAmount} onChange={setCash} className="h-10" />
        </div>
        <div className="space-y-2">
          <Label>Payment date</Label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div className="space-y-2">
          <Label>Payment mode</Label>
          <Select value={method} onValueChange={(v) => v && setMethod(v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!!availableCredit && availableCredit > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-emerald-500/5 p-3">
          <p className="flex items-center gap-1.5 text-sm">
            <Wallet className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-muted-foreground">Available credit:</span> <span className="font-semibold tabular-nums">{inr(availableCredit)}</span>
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap text-muted-foreground">Apply</Label>
            <NumberInput min={0} max={availableCredit} value={creditToApply} onChange={setCredit} className="h-9 w-28" />
            <button type="button" onClick={() => setCredit(availableCredit)} className="text-xs text-primary hover:underline">
              Apply all
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Note (optional)</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Unpaid bills</p>
          <button type="button" onClick={clearApplied} className="text-xs text-muted-foreground hover:text-foreground">
            Clear applied amount
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg border bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">Nothing outstanding for this vendor.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border sm:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Bill #</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Due</th>
                    <th className="px-3 py-2 text-right">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground"><DateText>{fmtDate(r.billDate)}</DateText></td>
                      <td className="px-3 py-2 font-medium">{r.billNumber}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{inr(r.total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{inr(r.due)}</td>
                      <td className="px-3 py-2">
                        <div className="ml-auto flex max-w-40 flex-col items-end gap-0.5">
                          <NumberInput min={0} max={r.due} value={rowPayments[r.id] || 0} onChange={(v) => setRowAmount(r.id, r.due, v)} className="h-9 w-32" />
                          <button type="button" onClick={() => payRowInFull(r)} className="text-[11px] text-primary hover:underline">
                            Pay in full
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <MobileRecordList>
              {rows.map((r) => (
                <MobileRecordCard key={r.id}>
                  <MobileRecordHeader title={r.billNumber} subtitle={<DateText>{fmtDate(r.billDate)}</DateText>} value={inr(r.due)} showChevron={false} />
                  <MobileRecordRow label="Total" value={inr(r.total)} />
                  <div className="flex items-center justify-between gap-2 border-t pt-1.5">
                    <span className="text-xs text-muted-foreground">Payment</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => payRowInFull(r)} className="text-[11px] text-primary hover:underline">
                        Pay in full
                      </button>
                      <NumberInput min={0} max={r.due} value={rowPayments[r.id] || 0} onChange={(v) => setRowAmount(r.id, r.due, v)} className="h-9 w-28" />
                    </div>
                  </div>
                </MobileRecordCard>
              ))}
            </MobileRecordList>
          </>
        )}
      </div>

      <div className="ml-auto max-w-xs space-y-1 rounded-lg border bg-muted/20 p-3 text-sm">
        <p className="flex items-center justify-between">
          <span className="text-muted-foreground">Total due</span>
          <span className="font-medium tabular-nums">{inr(totalDue)}</span>
        </p>
        <p className="flex items-center justify-between">
          <span className="text-muted-foreground">Applied to dues</span>
          <span className="font-semibold tabular-nums">{inr(appliedToDues)}</span>
        </p>
        {excess > 0 && (
          <p className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span>Saved as credit</span>
            <span className="font-semibold tabular-nums">{inr(excess)}</span>
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || pool <= 0}>
          {saving ? `Saving ${progress!.done}/${progress!.total}…` : "Record payment"}
        </Button>
      </div>
    </div>
  );
}
