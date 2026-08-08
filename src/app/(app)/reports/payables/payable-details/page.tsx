"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Wallet, Download } from "lucide-react";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useVendors } from "@/hooks/use-vendors";
import { inr, fmtDate } from "@/lib/format";
import { exportCSV } from "@/lib/export";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

/** Every bill that still owes money, ranked by balance — the raw payable list (see AP Aging Details for the same bills ranked by overdue days instead). */
export default function PayableDetailsPage() {
  const { data: bills, isLoading: l1 } = usePurchaseBills();
  const { data: vendors, isLoading: l2 } = useVendors();
  const isLoading = l1 || l2;

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);

  const rows = useMemo(() => (bills || []).filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance), [bills]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="Payable Details"
      description="Every bill with an outstanding balance, ranked by amount owed."
      actions={
        rows.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportCSV(
                rows.map((b) => ({ Bill: b.billNumber, Vendor: vendorNameById.get(b.vendorId) || "", "Bill Date": b.billDate, "Due Date": b.dueDate || "", Total: b.total, Balance: b.balance })),
                "payable_details"
              )
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="No outstanding bills" description="Everything is paid up." />
      ) : (
        <ReportTable>
          <thead className="border-b bg-muted/40">
            <tr>
              <Th>Bill</Th>
              <Th>Vendor</Th>
              <Th>Bill Date</Th>
              <Th>Due Date</Th>
              <Th align="right">Total</Th>
              <Th align="right">Balance</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((b) => (
              <tr key={b.id} className="hover:bg-muted/30">
                <Td className="font-medium">
                  <Link href={`/purchases/bills/${b.id}`} className="text-primary hover:underline">
                    {b.billNumber}
                  </Link>
                </Td>
                <Td>{vendorNameById.get(b.vendorId) || "Unknown vendor"}</Td>
                <Td className="text-muted-foreground">{fmtDate(b.billDate)}</Td>
                <Td className="text-muted-foreground">{b.dueDate ? fmtDate(b.dueDate) : "—"}</Td>
                <Td align="right" className="text-muted-foreground">{inr(b.total)}</Td>
                <Td align="right" className="font-medium">{inr(b.balance)}</Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
