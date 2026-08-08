"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2, Calculator } from "lucide-react";
import { useCostSheets } from "@/hooks/use-cost-sheets";
import { useDeleteCostSheet } from "@/hooks/use-cost-sheet-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportTable, Th, Td } from "@/components/reports/report-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** CostEstimatorView() list mode, Stitching_Manager_Pro_v16.html ~line 11493. */
export default function CostEstimatorPage() {
  const { data: sheets, isLoading } = useCostSheets();
  const { data: user } = useCurrentUser();
  const deleteSheet = useDeleteCostSheet();

  async function doDelete(id: string) {
    try {
      await deleteSheet.mutateAsync({ id, userEmail: user?.email });
      toast.success("Cost sheet deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const list = sheets || [];

  function StatusBadge({ status }: { status: string }) {
    const final = status === "final";
    return (
      <span
        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
          final ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"
        }`}
      >
        {status}
      </span>
    );
  }

  function DeleteButton({ id, sheetNo, product }: { id: string; sheetNo: string; product: string }) {
    return (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${sheetNo}`}>
              <Trash2 className="size-4" />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this cost sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              {sheetNo} — {product}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => doDelete(id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Cost Estimator"
        description="Price a product from materials, labour and overheads"
        actions={
          <Button nativeButton={false} render={<Link href="/cost-estimator/new" />}>
            <Plus className="size-4" /> New sheet
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No cost sheets yet"
          description="Build a costing to work out what a product should sell for."
          action={
            <Button nativeButton={false} render={<Link href="/cost-estimator/new" />}>
              <Plus className="size-4" /> New sheet
            </Button>
          }
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2.5 md:hidden">
            {list.map((s) => (
              <div key={s.id} className="rounded-xl border bg-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/cost-estimator/${s.id}/edit`} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.product_name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {s.cost_sheet_no} · {fmtDate(s.date)}
                    </p>
                  </Link>
                  <DeleteButton id={s.id} sheetNo={s.cost_sheet_no} product={s.product_name} />
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <StatusBadge status={s.status} />
                  <span className="text-base font-semibold tabular-nums">{inr(s.final_price)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <ReportTable>
              <thead className="border-b bg-muted/40">
                <tr>
                  <Th>Sheet #</Th>
                  <Th>Product</Th>
                  <Th>Date</Th>
                  <Th>Status</Th>
                  <Th align="right">Final price</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <Td>
                      <Link href={`/cost-estimator/${s.id}/edit`} className="font-medium hover:underline">
                        {s.cost_sheet_no}
                      </Link>
                    </Td>
                    <Td>{s.product_name}</Td>
                    <Td>{fmtDate(s.date)}</Td>
                    <Td>
                      <StatusBadge status={s.status} />
                    </Td>
                    <Td align="right" className="font-semibold">
                      {inr(s.final_price)}
                    </Td>
                    <Td align="right">
                      <DeleteButton id={s.id} sheetNo={s.cost_sheet_no} product={s.product_name} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          </div>
        </>
      )}
    </div>
  );
}
