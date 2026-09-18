"use client";

import { Inbox, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrderCardRow, OrderTableRow } from "@/components/orders/order-row";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import type { useColumnVisibility } from "@/hooks/use-column-visibility";
import type { useRowSelection } from "@/hooks/use-row-selection";
import type { Order } from "@/lib/types";
import type { Shop } from "@/lib/settings";
import type { OrderProfitBreakdown } from "@/lib/order-profit";

interface Props {
  orders: Order[];
  canChangeStage?: boolean;
  onAdvance?: (id: string) => void;
  advancingId?: string | null;
  shop?: Shop;
  onRecordPayment?: (order: Order) => void;
  columnTable?: ReturnType<typeof useColumnVisibility>;
  /** Omit to hide row checkboxes and the bulk-actions bar entirely. */
  selection?: ReturnType<typeof useRowSelection>;
  /** Only present when the viewer has viewReports — see orders/page.tsx. */
  profitByOrderId?: Map<string, OrderProfitBreakdown>;
  /** Resolves order.tailor (an employee id) to a display name — see orders/page.tsx. */
  tailorName?: (id: string) => string;
  /** Customer mobile → their public order-status link, for the {track_link} WhatsApp variable. */
  trackUrlByMobile?: Map<string, string>;
  /** Column-header click-to-sort — List view only (Board groups by stage, so sorting doesn't
   *  apply there). Omit any of these three to render plain, non-clickable headers. */
  sortKey?: string | null;
  sortAsc?: boolean;
  onSort?: (key: string) => void;
}

function SortableTh({
  label,
  sortableKey,
  align,
  sortKey,
  sortAsc,
  onSort,
}: {
  label: string;
  sortableKey: string;
  align?: "right";
  sortKey?: string | null;
  sortAsc?: boolean;
  onSort?: (key: string) => void;
}) {
  if (!onSort) return <th className={cn("px-2.5 py-2.5 font-bold", align === "right" && "text-right")}>{label}</th>;
  return (
    <th className={cn("px-2.5 py-2.5 font-bold", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(sortableKey)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", align === "right" && "flex-row-reverse")}
      >
        {label}{" "}
        <ArrowUpDown className={cn("size-3", sortKey === sortableKey ? "text-foreground" : "text-muted-foreground/60", sortKey === sortableKey && sortAsc && "rotate-180")} />
      </button>
    </th>
  );
}

export function OrdersList({ orders, canChangeStage, onAdvance, advancingId, shop, onRecordPayment, columnTable, selection, profitByOrderId, tailorName, trackUrlByMobile, sortKey, sortAsc, onSort }: Props) {
  if (orders.length === 0) {
    return <EmptyState icon={Inbox} title="No orders found" description="Try clearing your filters or search." />;
  }

  const isVisible = (key: string) => !columnTable || columnTable.isVisible(key);
  const sortableThProps = { sortKey, sortAsc, onSort };
  // Best-effort — only counts/sums siblings visible on this same filtered/paginated list, not
  // every order sharing the group_id across the whole system. Good enough for "at a glance", not
  // meant as authoritative (the order detail page's own linked-orders list is that).
  const groupSiblingsOf = (o: Order) => (o.groupId ? orders.filter((sib) => sib.groupId === o.groupId) : []);
  const groupSizeOf = (o: Order) => (o.groupId ? groupSiblingsOf(o).length : undefined);
  const groupTotalOf = (o: Order) => (o.groupId ? groupSiblingsOf(o).reduce((s, sib) => s + sib.total, 0) : undefined);

  return (
    <div className="space-y-2.5">
      {/* Mobile cards */}
      <div className="md:hidden space-y-2.5">
        {orders.map((o) => (
          <OrderCardRow
            key={o.id}
            order={o}
            canChangeStage={canChangeStage}
            onAdvance={onAdvance}
            advancing={advancingId === o.id}
            shop={shop}
            onRecordPayment={onRecordPayment}
            tailorName={tailorName}
            trackUrl={trackUrlByMobile?.get(o.mobile)}
            groupSize={groupSizeOf(o)}
            groupTotal={groupTotalOf(o)}
          />
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b text-left text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <th className="w-1 p-0" />
                {selection && (
                  <th className="w-8 px-2.5 py-2.5">
                    <Checkbox
                      checked={selection.allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selection.someSelected;
                      }}
                      onChange={selection.toggleAll}
                      aria-label="Select all orders"
                    />
                  </th>
                )}
                {isVisible("order") && <SortableTh {...sortableThProps} label="Order" sortableKey="order" />}
                {isVisible("customer") && <SortableTh {...sortableThProps} label="Customer" sortableKey="customer" />}
                {isVisible("garment") && <SortableTh {...sortableThProps} label="Garment" sortableKey="garment" />}
                {isVisible("stage") && <SortableTh {...sortableThProps} label="Stage" sortableKey="stage" />}
                {isVisible("tailor") && <SortableTh {...sortableThProps} label="Tailor" sortableKey="tailor" />}
                {isVisible("delivery") && <SortableTh {...sortableThProps} label="Delivery" sortableKey="delivery" />}
                {isVisible("total") && <SortableTh {...sortableThProps} label="Total" sortableKey="total" align="right" />}
                {isVisible("balance") && <SortableTh {...sortableThProps} label="Balance" sortableKey="balance" align="right" />}
                {profitByOrderId && isVisible("profit") && <SortableTh {...sortableThProps} label="Profit" sortableKey="profit" align="right" />}
                {profitByOrderId && isVisible("tailorPayable") && <SortableTh {...sortableThProps} label="Tailor Payable" sortableKey="tailorPayable" align="right" />}
                {profitByOrderId && isVisible("stitchingCost") && <SortableTh {...sortableThProps} label="Stitching Cost" sortableKey="stitchingCost" align="right" />}
                <th className="px-2.5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <OrderTableRow
                  key={o.id}
                  order={o}
                  canChangeStage={canChangeStage}
                  onAdvance={onAdvance}
                  advancing={advancingId === o.id}
                  shop={shop}
                  onRecordPayment={onRecordPayment}
                  isVisible={isVisible}
                  selection={selection}
                  profit={profitByOrderId?.get(o.id)}
                  tailorName={tailorName}
                  trackUrl={trackUrlByMobile?.get(o.mobile)}
                  groupSize={groupSizeOf(o)}
                  groupTotal={groupTotalOf(o)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
