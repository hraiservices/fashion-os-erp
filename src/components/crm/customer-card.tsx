"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Phone, Pencil, Trash2, Ruler, MoreVertical } from "lucide-react";
import { loyaltyTier, type LoyaltyConfig } from "@/lib/business-rules";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDeleteCustomerAndOrders } from "@/hooks/use-customer-mutations";
import { inr, fmtDateShort } from "@/lib/format";
import { sumOrdersOutstanding, sumInvoicesOutstanding } from "@/lib/balances";
import type { CustomerProfile } from "@/lib/crm";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";
import { StageBadge } from "@/components/orders/stage-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tagBadgeClass } from "@/components/ui/tag-picker";
import { EditCustomerModal } from "@/components/crm/edit-customer-modal";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function CustomerCard({ cust, loyaltyCfg, invoices = [] }: { cust: CustomerProfile; loyaltyCfg?: LoyaltyConfig; invoices?: SalesInvoiceWithBalance[] }) {
  const { data: user } = useCurrentUser();
  const deleteCustomer = useDeleteCustomerAndOrders();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const latestOrder = [...cust.orders].sort((a, b) => new Date(b.inDate).getTime() - new Date(a.inDate).getTime())[0];
  const hasMeasurements = cust.measurements && Object.keys(cust.measurements).length > 0;
  const tier = loyaltyCfg?.enabled ? loyaltyTier(cust.totalEarned, loyaltyCfg) : null;
  const initial = cust.name?.[0]?.toUpperCase() || "?";
  const stitchDue = sumOrdersOutstanding(cust.orders);
  const salesDue = sumInvoicesOutstanding(invoices);
  const outstanding = stitchDue + salesDue;

  async function doDelete() {
    try {
      await deleteCustomer.mutateAsync({ mobile: cust.mobile, name: cust.name, custId: cust.custId, userEmail: user?.email });
      toast.success(`${cust.name} and ${cust.orders.length} order(s) deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <Link href={`/crm/${cust.mobile}`} className="flex items-start gap-3 p-4 pb-3 transition-colors active:bg-muted/40">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initial}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{cust.name}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Phone className="size-3 shrink-0" />
            {cust.mobile}
          </p>
        </div>
        {user?.perms.manageCustomers && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`Actions for ${cust.name}`}
                  className="-m-1.5 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted sm:size-8"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <MoreVertical className="size-4" />
                </button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Edit
              </DropdownMenuItem>
              {user?.perms.deleteCustomers && (
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </Link>

      <Link href={`/crm/${cust.mobile}`} className="grid grid-cols-3 gap-px border-y bg-border/60 text-center">
        <Stat label="Stitch Orders" value={String(cust.orders.length)} />
        <Stat label="Spent" value={inr(cust.spent)} />
        <Stat label="Last" value={fmtDateShort(latestOrder?.inDate || "")} />
      </Link>

      <div className="flex flex-wrap items-center gap-1.5 p-3">
        {latestOrder && <StageBadge stage={latestOrder.status} size="sm" />}
        {tier && (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.color }}>
            {tier.label} · {cust.loyaltyPoints} pts
          </span>
        )}
        {hasMeasurements && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            <Ruler className="size-3" /> Measured
          </span>
        )}
        {cust.tags.map((tag) => (
          <Badge key={tag} variant="outline" className={tagBadgeClass(tag)}>
            {tag}
          </Badge>
        ))}
      </div>

      {outstanding > 0 && (
        <div className="grid grid-cols-3 gap-px border-t bg-border/60 text-center">
          <Stat label="Stitch Due" value={inr(stitchDue)} />
          <Stat label="Sales Due" value={inr(salesDue)} />
          <Stat label="Total Due" value={inr(outstanding)} valueClassName="text-red-600 dark:text-red-400" />
        </div>
      )}

      <EditCustomerModal cust={cust} open={editOpen} onOpenChange={setEditOpen} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {cust.name} and all {cust.orders.length} order(s)?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
              {outstanding > 0 && ` This customer still owes ${inr(outstanding)} — deleting erases that record.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="bg-card px-1 py-2">
      <p className={`truncate text-[13px] font-semibold tabular-nums ${valueClassName ?? ""}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
