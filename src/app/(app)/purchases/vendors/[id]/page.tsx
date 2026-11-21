"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone, Mail, MapPin, FileText, Pencil, Trash2, Plus, ChevronDown } from "lucide-react";
import { ReceiptDuotoneIcon } from "@/components/icons/duotone-icons";
import { useVendor, useVendors } from "@/hooks/use-vendors";
import { usePurchaseOrders } from "@/hooks/use-purchase-orders";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useAllVendorPayments } from "@/hooks/use-vendor-payments";
import { useDeleteVendor } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/ui/back-link";
import { DetailSidebarList } from "@/components/ui/detail-sidebar-list";
import { RecordPrevNext } from "@/components/ui/record-prev-next";
import { DetailStatRow, DetailStatTile } from "@/components/ui/detail-stat-tile";
import { VendorTransactions } from "@/components/purchases/vendor-transactions";
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

export default function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: vendor, isLoading } = useVendor(id);
  const { data: allVendors } = useVendors();
  const { data: allOrders } = usePurchaseOrders();
  const { data: allBills } = usePurchaseBills();
  const { data: allPayments } = useAllVendorPayments();
  const { data: user } = useCurrentUser();
  const deleteVendor = useDeleteVendor();

  const [deleteOpen, setDeleteOpen] = useState(false);

  const canManage = !!user?.perms.managePurchases;

  const orders = [...(allOrders || []).filter((o) => o.vendorId === id)].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const bills = [...(allBills || []).filter((b) => b.vendorId === id)].sort((a, b) => new Date(b.billDate).getTime() - new Date(a.billDate).getTime());
  const payments = [...(allPayments || []).filter((p) => p.vendorId === id)].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const totalPayable = bills.reduce((s, b) => s + b.balance, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  // Same payable computation as the Vendors list page: sum each vendor's bill balances.
  const payableByVendor = new Map<string, number>();
  (allBills || []).forEach((b) => payableByVendor.set(b.vendorId, (payableByVendor.get(b.vendorId) || 0) + b.balance));
  const sidebarItems = (allVendors || []).map((v) => {
    const payable = payableByVendor.get(v.id) || 0;
    return {
      id: v.id,
      title: v.name,
      subtitle: v.mobile || v.email || undefined,
      amountLabel: payable > 0 ? `${inr(payable)} payable` : "No dues",
      amountTone: payable > 0 ? ("due" as const) : ("plain" as const),
      href: `/purchases/vendors/${v.id}`,
    };
  });

  async function doDelete() {
    if (!vendor) return;
    try {
      await deleteVendor.mutateAsync({ id: vendor.id, name: vendor.name, userEmail: user?.email });
      toast.success(`${vendor.name} deleted`);
      router.push("/purchases/vendors");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="flex items-start gap-4 p-4 sm:p-6">
        <DetailSidebarList items={sidebarItems} activeId={id} searchPlaceholder="Search vendors…" emptyLabel="No vendors yet" />
        <div className="min-w-0 flex-1 p-2">
          <EmptyState icon={ReceiptDuotoneIcon} title="Vendor not found" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 p-4 sm:p-6">
      <DetailSidebarList items={sidebarItems} activeId={id} searchPlaceholder="Search vendors…" emptyLabel="No vendors yet" />
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <BackLink href="/purchases/vendors">Vendors</BackLink>
          <RecordPrevNext items={sidebarItems} activeId={id} />
        </div>

        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <h1 className="text-xl font-semibold tracking-tight">{vendor.name}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {vendor.mobile && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" /> {vendor.mobile}
              </span>
            )}
            {vendor.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5" /> {vendor.email}
              </span>
            )}
            {vendor.gstin && (
              <span className="inline-flex items-center gap-1.5">
                <FileText className="size-3.5" /> {vendor.gstin}
              </span>
            )}
          </div>
          {vendor.address && (
            <p className="mt-1 inline-flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" /> {vendor.address}
            </p>
          )}

          <div className="mt-4">
            <DetailStatRow>
              <DetailStatTile value={orders.length} label="Purchase orders" />
              <DetailStatTile value={bills.length} label="Bills" />
              <DetailStatTile value={inr(totalPayable)} label="Payable" tone={totalPayable > 0 ? "due" : "good"} />
            </DetailStatRow>
          </div>

          {/* Mirrors the Customer page's always-visible action row: one primary "New Transaction"
              menu for the create actions, Edit and Delete as their own buttons (the two things
              staff reach for most), gated by the same managePurchases permission already used
              on the Vendors list. */}
          <div className="mt-4 flex flex-wrap gap-2">
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button className="h-10 px-4" />}>
                  <Plus className="size-4" /> New Transaction <ChevronDown className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem render={<Link href={`/purchases/orders/new?vendor=${vendor.id}`} />}>
                    <Plus className="size-4" /> Purchase order
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href={`/purchases/bills/new?vendor=${vendor.id}`} />}>
                    <Plus className="size-4" /> Bill
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {canManage && (
              <Button variant="outline" className="h-10" nativeButton={false} render={<Link href={`/purchases/vendors/${vendor.id}/edit`} />}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}

            {canManage && (
              <Button
                variant="outline"
                className="h-10 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            )}

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {vendor.name}?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone. Bills already recorded against this vendor are kept.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={doDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <VendorTransactions
          vendorId={vendor.id}
          orders={orders}
          bills={bills}
          payments={payments}
          totalPayable={totalPayable}
          totalPaid={totalPaid}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
