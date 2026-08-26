"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, LayoutList, KanbanSquare, ArrowRight, Trash2, Upload, MessageCircle } from "lucide-react";
import { BulkWhatsAppDialog } from "@/components/orders/bulk-whatsapp-dialog";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { useOrders } from "@/hooks/use-orders";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useActiveTailors } from "@/hooks/use-employees";
import { useAdvanceStage, useSetStage, useDeleteOrder } from "@/hooks/use-order-mutations";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useOrderExpensesByOrderId } from "@/hooks/use-order-expenses";
import { computeOrderProfit, type OrderProfitBreakdown } from "@/lib/order-profit";
import { useColumnVisibility } from "@/hooks/use-column-visibility";
import { useSavedViews } from "@/hooks/use-saved-views";
import { useRowSelection } from "@/hooks/use-row-selection";
import { KanbanBoard } from "@/components/orders/kanban-board";
import { OrdersList } from "@/components/orders/orders-list";
import { OrderFilters, EMPTY_FILTERS, type FilterState } from "@/components/orders/order-filters";
import { PaymentModal } from "@/components/orders/payment-modal";
import type { Order } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ColumnCustomizerMenu } from "@/components/ui/column-customizer";
import { SavedViewsMenu } from "@/components/ui/saved-views-menu";
import { ExportMenu } from "@/components/ui/export-menu";
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
import { Suspense } from "react";
import { daysLeft, getNextStage, STAGE_META, DEFAULT_TAILOR_RATES, type Stage, type TailorRateCard } from "@/lib/business-rules";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PendingStageChange {
  type: "advance" | "set";
  orderId: string;
  fromStage: Stage;
  toStage: Stage;
  orderName: string;
  balance: number;
}

interface OrdersViewFilters {
  search: string;
  filters: FilterState;
}

const ORDER_COLUMNS = [
  { key: "order", label: "Order#", required: true },
  { key: "customer", label: "Customer", required: true },
  { key: "stage", label: "Stage" },
  { key: "delivery", label: "Delivery" },
  { key: "total", label: "Total" },
  { key: "balance", label: "Balance" },
  { key: "profit", label: "Profit" },
];

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="space-y-3 p-4 sm:p-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}>
      <OrdersContent />
    </Suspense>
  );
}

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [filters, setFilters] = useState<FilterState>(() => {
    const stage = searchParams.get("stage");
    const type = searchParams.get("type");
    const orderType = type === "alteration" || type === "new" ? type : "all";
    return { ...EMPTY_FILTERS, ...(stage ? { stage } : {}), orderType };
  });
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Derive view directly from URL — reactive to sidebar nav and back/forward.
  const view = searchParams.get("view") === "board" ? "board" : "list";

  function setView(v: "board" | "list") {
    const params = new URLSearchParams(searchParams.toString());
    if (v === "board") params.set("view", "board");
    else params.delete("view");
    router.replace(`/orders${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const { data: orders, isLoading } = useOrders();
  const { data: user } = useCurrentUser();
  const { data: shop } = useShopSettings();
  const advanceStage = useAdvanceStage();
  const setStage = useSetStage();
  const deleteOrder = useDeleteOrder();
  const { data: tailorRates } = useAppSetting<TailorRateCard>("tailorRates", DEFAULT_TAILOR_RATES);
  const { data: expensesByOrderId } = useOrderExpensesByOrderId();

  // Same computeOrderProfit() the New Order form, Order Details, and Order Profitability
  // report all use — one Profit column that can never disagree with those. Only computed
  // (and only ever shown) for users who can see cost data at all.
  const profitByOrderId = useMemo(() => {
    if (!user?.perms.viewReports || !orders) return undefined;
    const map = new Map<string, OrderProfitBreakdown>();
    for (const o of orders) {
      map.set(o.id, computeOrderProfit(o, tailorRates || DEFAULT_TAILOR_RATES, expensesByOrderId.get(o.id) || []));
    }
    return map;
  }, [orders, user?.perms.viewReports, tailorRates, expensesByOrderId]);

  const columnTable = useColumnVisibility("orders", ORDER_COLUMNS);
  const savedViews = useSavedViews<OrdersViewFilters>("orders");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkWhatsAppOpen, setBulkWhatsAppOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const { data: tailors } = useActiveTailors();

  const filtered = useMemo(() => {
    if (!orders) return [];
    const q = search.trim().toLowerCase();
    let list = orders.filter((o) => !q || o.name.toLowerCase().includes(q) || o.mobile.includes(q) || o.id.toLowerCase().includes(q));

    if (filters.tailor !== "all") list = list.filter((o) => o.tailor === filters.tailor);
    if (filters.stage !== "all") list = list.filter((o) => o.status === filters.stage);
    if (filters.orderType !== "all") list = list.filter((o) => o.orderType === filters.orderType);

    if (filters.priority !== "all") {
      list = list.filter((o) => {
        if (o.status === "delivered" || o.status === "payment") return false;
        const d = daysLeft(o.deliveryDate);
        if (filters.priority === "overdue") return d < 0;
        if (filters.priority === "soon") return d === 0 || d === 1;
        return d > 1;
      });
    }

    if (filters.datePreset === "month") {
      const ym = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);
      list = list.filter((o) => o.inDate?.startsWith(ym));
    } else if (filters.datePreset === "custom" && filters.customFrom && filters.customTo) {
      list = list.filter((o) => o.inDate >= filters.customFrom && o.inDate <= filters.customTo);
    }

    return [...list].sort((a, b) => {
      const diff = new Date(a.inDate || 0).getTime() - new Date(b.inDate || 0).getTime();
      return filters.sort === "newest" ? -diff : diff;
    });
  }, [orders, search, filters]);

  const [pendingChange, setPendingChange] = useState<PendingStageChange | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const advancingId = advanceStage.isPending ? (advanceStage.variables as string) : null;

  const selection = useRowSelection(filtered.map((o) => o.id));
  const selectedOrders = filtered.filter((o) => selection.selected.has(o.id));

  function applyView(v: OrdersViewFilters) {
    setSearch(v.search);
    setFilters(v.filters);
  }

  async function bulkDeleteOrders() {
    setBulkBusy(true);
    setBulkDeleteOpen(false);
    let failed = 0;
    // The actual reason a delete was refused (has money against it, is linked, etc.) used to
    // be thrown away here — the toast only ever showed a bare count, leaving the user to guess
    // why. Keep the first real failure message so a single-item delete (the common case) tells
    // you exactly what to fix instead of a dead-end "1 failed".
    let firstError: string | null = null;
    for (const o of selectedOrders) {
      try {
        await deleteOrder.mutateAsync({ id: o.id, name: o.name, userEmail: user?.email });
      } catch (e) {
        failed++;
        if (!firstError) firstError = e instanceof Error ? e.message : null;
      }
    }
    setBulkBusy(false);
    selection.clear();
    if (failed) {
      const suffix = firstError ? `: ${firstError}` : "";
      toast.error(`${selectedOrders.length - failed} deleted, ${failed} failed${failed === 1 ? suffix : ` (first error${suffix})`}`);
    } else {
      toast.success(`${selectedOrders.length} order(s) deleted`);
    }
  }

  const bulkExportRows = selectedOrders.map((o) => ({
    Order: o.id,
    Date: o.inDate,
    Customer: o.name,
    Mobile: o.mobile,
    Stage: o.status,
    Delivery: o.deliveryDate,
    Total: o.total,
    Balance: o.balance,
  }));

  /** Called when user clicks the advance button on a card. */
  function handleAdvance(id: string) {
    const order = orders?.find((o) => o.id === id);
    if (!order) return;
    const next = getNextStage(order.status);
    if (!next) return;

    if (next === "payment" && order.balance > 0) {
      toast.error(`Clear balance of ${inr(order.balance)} before marking as paid`);
      return;
    }

    setPendingChange({
      type: "advance",
      orderId: id,
      fromStage: order.status as Stage,
      toStage: next,
      orderName: order.name,
      balance: order.balance,
    });
  }

  /** Called when user drags a card to a column (set-stage). */
  function handleSetStage(id: string, stage: Stage) {
    const order = orders?.find((o) => o.id === id);
    if (!order) return;
    if (order.status === stage) return;

    const next = getNextStage(order.status);
    if (next !== stage) {
      toast.error("Change stage step by step — you can only move to the next stage");
      return;
    }

    if (stage === "payment" && order.balance > 0) {
      toast.error(`Clear balance of ${inr(order.balance)} before marking as paid`);
      return;
    }

    setPendingChange({
      type: "set",
      orderId: id,
      fromStage: order.status as Stage,
      toStage: stage,
      orderName: order.name,
      balance: order.balance,
    });
  }

  async function confirmStageChange() {
    if (!pendingChange) return;
    const { type, orderId, toStage } = pendingChange;
    setPendingChange(null);
    try {
      if (type === "advance") {
        const res = await advanceStage.mutateAsync(orderId);
        const next = res.order.status;
        toast.success(next === "ready" ? "Marked ready for pickup" : next === "payment" ? "Marked as paid" : "Stage updated");
      } else {
        await setStage.mutateAsync({ orderId, stage: toStage });
        toast.success(`Moved to ${STAGE_META[toStage].label}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to change stage");
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Stitching Orders"
        description={`${filtered.length} of ${orders?.length ?? 0} orders`}
        actions={
          <>
            <SegmentedToggle
              ariaLabel="View mode"
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: "List", icon: LayoutList },
                { value: "board", label: "Board", icon: KanbanSquare },
              ]}
            />
            {user?.perms.addOrder && (
              <Button variant="outline" nativeButton={false} render={<Link href="/orders/import" />}>
                <Upload className="size-4" /> Import
              </Button>
            )}
            {user?.perms.addOrder && (
              <Button nativeButton={false} render={<Link href="/orders/new" />} className="hidden sm:inline-flex">
                <Plus className="size-4" /> New order
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, mobile or order ID…"
              className="h-10 pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search orders"
            />
          </div>
          <SavedViewsMenu
            views={savedViews.views}
            onApply={applyView}
            onSave={savedViews.save}
            onRemove={savedViews.remove}
            currentFilters={{ search, filters }}
          />
          {view === "list" && <ColumnCustomizerMenu table={columnTable} />}
        </div>

        <OrderFilters
          value={filters}
          onChange={setFilters}
          tailors={tailors}
          resultCount={filtered.length}
          mobileOpen={filterSheetOpen}
          onMobileOpenChange={setFilterSheetOpen}
        />
      </div>

      {view === "list" && !isLoading && (user?.perms.deleteOrder || user?.perms.managePayments) && selection.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selection.count} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <ExportMenu rows={bulkExportRows} filename="orders_export" disabled={bulkBusy} />
            {user?.perms.managePayments && (
              <Button variant="outline" size="sm" onClick={() => setBulkWhatsAppOpen(true)} disabled={bulkBusy}>
                <MessageCircle className="size-3.5" /> Send reminders
              </Button>
            )}
            {user?.perms.deleteOrder && (
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)} disabled={bulkBusy}>
                <Trash2 className="size-3.5" /> Delete
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={selection.clear} disabled={bulkBusy}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full md:h-14" />
          ))}
        </div>
      ) : view === "board" ? (
        <KanbanBoard
          orders={filtered}
          canChangeStage={user?.perms.changeStage}
          onAdvance={handleAdvance}
          advancingId={advancingId}
          shop={shop}
          onSetStage={handleSetStage}
          onRecordPayment={user?.perms.managePayments ? setPaymentOrder : undefined}
        />
      ) : (
        <OrdersList
          orders={filtered}
          canChangeStage={user?.perms.changeStage}
          onAdvance={handleAdvance}
          advancingId={advancingId}
          shop={shop}
          onRecordPayment={user?.perms.managePayments ? setPaymentOrder : undefined}
          columnTable={columnTable}
          selection={user?.perms.deleteOrder || user?.perms.managePayments ? selection : undefined}
          profitByOrderId={profitByOrderId}
        />
      )}

      {/* Stage change confirmation dialog */}
      <AlertDialog open={!!pendingChange} onOpenChange={(open) => { if (!open) setPendingChange(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to {pendingChange ? STAGE_META[pendingChange.toStage].label : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Move <strong className="text-foreground">{pendingChange?.orderName}</strong> from{" "}
              <strong className="text-foreground">{pendingChange ? STAGE_META[pendingChange.fromStage].label : ""}</strong>
              {" "}<ArrowRight className="inline size-3.5" />{" "}
              <strong className="text-foreground">{pendingChange ? STAGE_META[pendingChange.toStage].label : ""}</strong>?
              {pendingChange?.toStage === "payment" && (
                <span className="mt-2 block font-medium text-emerald-700 dark:text-emerald-400">This will mark the order as fully paid.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStageChange}>Yes, move it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {paymentOrder && <PaymentModal order={paymentOrder} open={!!paymentOrder} onOpenChange={(v) => !v && setPaymentOrder(null)} />}

      <BulkWhatsAppDialog orders={selectedOrders} shop={shop} open={bulkWhatsAppOpen} onOpenChange={setBulkWhatsAppOpen} />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selection.count} order(s)?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDeleteOrders}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
