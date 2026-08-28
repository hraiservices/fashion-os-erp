"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Truck, Pencil, Trash2, ChevronRight, Upload } from "lucide-react";
import { useVendors } from "@/hooks/use-vendors";
import { usePurchaseBills } from "@/hooks/use-purchase-bills";
import { useDeleteVendor } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { BalanceDue } from "@/components/ui/money-text";
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
import type { Vendor } from "@/lib/types";

function VendorsPageContent() {
  const router = useRouter();
  const { data: vendors, isLoading } = useVendors();
  const { data: bills } = usePurchaseBills();
  const { data: user } = useCurrentUser();
  const deleteVendor = useDeleteVendor();

  const [search, setSearch] = useState("");

  const canManage = !!user?.perms.managePurchases;

  const payableByVendor = useMemo(() => {
    const map = new Map<string, number>();
    (bills || []).forEach((b) => map.set(b.vendorId, (map.get(b.vendorId) || 0) + b.balance));
    return map;
  }, [bills]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (vendors || []).filter((v) => !q || v.name.toLowerCase().includes(q) || v.mobile.includes(q) || v.gstin.toLowerCase().includes(q));
  }, [vendors, search]);

  function openEdit(v: Vendor, e: React.MouseEvent) {
    e.preventDefault();
    router.push(`/purchases/vendors/${v.id}/edit`);
  }

  async function handleDelete(v: Vendor) {
    try {
      await deleteVendor.mutateAsync({ id: v.id, name: v.name, userEmail: user?.email });
      toast.success(`${v.name} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Vendors"
        description={`${filtered.length} of ${vendors?.length ?? 0} vendors`}
        actions={
          canManage && (
            <div className="flex items-center gap-2">
              <Button variant="outline" nativeButton={false} render={<Link href="/purchases/vendors/import" />}>
                <Upload className="size-4" /> Import
              </Button>
              <Button nativeButton={false} render={<Link href="/purchases/vendors/new" />}>
                <Plus className="size-4" /> Add vendor
              </Button>
            </div>
          )
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search name, mobile or GSTIN…" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search vendors" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No vendors yet"
          description="Add the suppliers you purchase fabric and materials from."
          action={
            canManage && (
              <Button nativeButton={false} render={<Link href="/purchases/vendors/new" />}>
                <Plus className="size-4" /> Add vendor
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const payable = payableByVendor.get(v.id) || 0;
            return (
              <Link key={v.id} href={`/purchases/vendors/${v.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[v.mobile, v.gstin].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                {payable > 0 && <BalanceDue amount={payable} suffix=" due" paidLabel="" className="shrink-0 text-sm" />}
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" onClick={(e) => openEdit(v, e)} aria-label={`Edit ${v.name}`}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" aria-label={`Delete ${v.name}`} onClick={(e) => e.preventDefault()}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {v.name}?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone. Bills already recorded against this vendor are kept.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(v)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}

    </div>
  );
}

export default function VendorsPage() {
  return <VendorsPageContent />;
}
