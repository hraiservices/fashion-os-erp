"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, MoreVertical, Wallet } from "lucide-react";
import { loyaltyTier, normalizeIndianMobile, type LoyaltyConfig } from "@/lib/business-rules";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDeleteCustomerAndOrders } from "@/hooks/use-customer-mutations";
import { inr, fmtDateShort } from "@/lib/format";
import { sumOrdersOutstanding, sumInvoicesOutstanding, isOrderOutstanding } from "@/lib/balances";
import type { CustomerProfile } from "@/lib/crm";
import type { Order } from "@/lib/types";
import type { Shop } from "@/lib/settings";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { WhatsAppIconButton } from "@/components/ui/whatsapp-button";
import { EditCustomerModal } from "@/components/crm/edit-customer-modal";
import { RefChips } from "@/components/crm/ref-chips";
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

/** Desktop table row for the CRM list view — same data/actions as CustomerCard, denser layout. */
export function CustomerListRow({
  cust,
  loyaltyCfg,
  shop,
  invoices = [],
  onRecordPayment,
}: {
  cust: CustomerProfile;
  loyaltyCfg?: LoyaltyConfig;
  shop?: Shop;
  invoices?: SalesInvoiceWithBalance[];
  onRecordPayment?: (order: Order) => void;
}) {
  const { data: user } = useCurrentUser();
  const deleteCustomer = useDeleteCustomerAndOrders();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const latestOrder = [...cust.orders].sort((a, b) => new Date(b.inDate).getTime() - new Date(a.inDate).getTime())[0];
  const tier = loyaltyCfg?.enabled ? loyaltyTier(cust.totalEarned, loyaltyCfg) : null;
  const stitchDue = sumOrdersOutstanding(cust.orders);
  const salesDue = sumInvoicesOutstanding(invoices);
  const outstanding = stitchDue + salesDue;
  const payableOrder = [...cust.orders]
    .filter(isOrderOutstanding)
    .sort((a, b) => new Date(b.inDate).getTime() - new Date(a.inDate).getTime())[0];
  const reminderUrl = `https://wa.me/91${normalizeIndianMobile(cust.mobile)}?text=${encodeURIComponent(
    `Dear *${cust.name}* 🙏\n\n₹${outstanding} is due on your account at *${shop?.name || "our company"}*.\nPlease clear at your earliest convenience.\n📞 ${shop?.phone || ""}`
  )}`;
  const initial = cust.name?.[0]?.toUpperCase() || "?";
  const orderChips = [...cust.orders]
    .sort((a, b) => new Date(b.inDate).getTime() - new Date(a.inDate).getTime())
    .map((o) => ({ key: o.id, label: o.id, href: `/orders/${o.id}` }));
  const invoiceChips = [...invoices]
    .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
    .map((i) => ({ key: i.id, label: i.invoiceNumber, href: `/sales/invoices/${i.id}` }));

  async function doDelete() {
    try {
      await deleteCustomer.mutateAsync({ mobile: cust.mobile, name: cust.name, custId: cust.custId, userEmail: user?.email });
      toast.success(`${cust.name} and ${cust.orders.length} order(s) deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <TableRow className="cursor-pointer" onClick={() => (window.location.href = `/crm/${cust.mobile}`)}>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initial}</span>
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{cust.name}</p>
            <p className="truncate text-xs text-muted-foreground">{cust.mobile}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <RefChips items={orderChips} moreHref={`/crm/${cust.mobile}`} />
      </TableCell>
      <TableCell>
        <RefChips items={invoiceChips} moreHref={`/crm/${cust.mobile}`} />
      </TableCell>
      <TableCell className="text-right tabular-nums">{inr(cust.spent)}</TableCell>
      <TableCell className="text-muted-foreground">{fmtDateShort(latestOrder?.inDate || "")}</TableCell>
      <TableCell>
        {tier ? (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: tier.bg, color: tier.color }}>
            {tier.label}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {outstanding > 0 ? (
          <div className="space-y-0.5 text-xs leading-tight">
            <p className="text-muted-foreground">
              Stitch <span className="tabular-nums text-foreground">{inr(stitchDue)}</span>
            </p>
            <p className="text-muted-foreground">
              Sales <span className="tabular-nums text-foreground">{inr(salesDue)}</span>
            </p>
            <p className="font-semibold text-red-600 tabular-nums dark:text-red-400">{inr(outstanding)}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1.5">
          {outstanding > 0 && <WhatsAppIconButton href={reminderUrl} label={`Payment reminder for ${cust.name}`} />}
          {onRecordPayment && payableOrder && (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={`Collect payment from ${cust.name}`}
              title="Collect payment"
              onClick={() => onRecordPayment(payableOrder)}
            >
              <Wallet className="size-4" />
            </Button>
          )}
          {user?.perms.manageCustomers && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button type="button" aria-label={`Actions for ${cust.name}`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
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
        </div>

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
      </TableCell>
    </TableRow>
  );
}
