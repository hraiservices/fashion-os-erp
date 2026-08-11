"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useVendors } from "@/hooks/use-vendors";
import { daysLeft } from "@/lib/business-rules";
import { inr, fmtDate } from "@/lib/format";
import { ReportShell, ReportTable, Th, Td } from "@/components/reports/report-shell";
import { ExportMenu } from "@/components/ui/export-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function ApAgingDetailsPage() {
  const { data: bills, isLoading: l1 } = usePurchaseBills();
  const { data: vendors, isLoading: l2 } = useVendors();
  const isLoading = l1 || l2;

  const vendorNameById = useMemo(() => new Map((vendors || []).map((v) => [v.id, v.name])), [vendors]);

  const rows = useMemo(() => {
    return (bills || [])
      .filter((b) => b.balance > 0)
      .map((b) => ({ ...b, daysOverdue: b.dueDate ? Math.max(0, -daysLeft(b.dueDate)) : 0 }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [bills]);

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <ReportShell
      title="AP Aging Details"
      description="Every outstanding bill, ranked by how overdue it is."
      actions={
        rows.length > 0 && (
          <ExportMenu
            rows={rows.map((b) => ({
              Bill: b.billNumber,
              Vendor: vendorNameById.get(b.vendorId) || "",
              "Due Date": b.dueDate || "",
              Balance: b.balance,
              "Days Overdue": b.daysOverdue,
            }))}
            filename="ap_aging_details"
          />
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
              <Th>Due Date</Th>
              <Th align="right">Balance</Th>
              <Th align="right">Days Overdue</Th>
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
                <Td className="text-muted-foreground">{b.dueDate ? fmtDate(b.dueDate) : "—"}</Td>
                <Td align="right">{inr(b.balance)}</Td>
                <Td align="right">
                  {b.daysOverdue > 0 ? <span className="font-medium text-red-600 dark:text-red-400">{b.daysOverdue}d</span> : "Not due"}
                </Td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </ReportShell>
  );
}
