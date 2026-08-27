"use client";

import { Inbox } from "lucide-react";
import { OrderCardRow, OrderTableRow } from "@/components/orders/order-row";
import { EmptyState } from "@/components/ui/empty-state";
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
}

export function OrdersList({ orders, canChangeStage, onAdvance, advancingId, shop, onRecordPayment, columnTable, selection, profitByOrderId, tailorName }: Props) {
  if (orders.length === 0) {
    return <EmptyState icon={Inbox} title="No orders found" description="Try clearing your filters or search." />;
  }

  const isVisible = (key: string) => !columnTable || columnTable.isVisible(key);

  return (
    <div className="space-y-2.5">
      {/* Mobile cards */}
      <div className="md:hidden space-y-2.5">
        {orders.map((o) => (
          <OrderCardRow key={o.id} order={o} canChangeStage={canChangeStage} onAdvance={onAdvance} advancing={advancingId === o.id} shop={shop} onRecordPayment={onRecordPayment} />
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-1 p-0" />
                {selection && (
                  <th className="w-8 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selection.allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selection.someSelected;
                      }}
                      onChange={selection.toggleAll}
                      aria-label="Select all orders"
                    />
                  </th>
                )}
                {isVisible("order") && <th className="px-3 py-2.5 font-medium">Order</th>}
                {isVisible("customer") && <th className="px-3 py-2.5 font-medium">Customer</th>}
                {isVisible("stage") && <th className="px-3 py-2.5 font-medium">Stage</th>}
                {isVisible("tailor") && <th className="px-3 py-2.5 font-medium">Tailor</th>}
                {isVisible("delivery") && <th className="px-3 py-2.5 font-medium">Delivery</th>}
                {isVisible("total") && <th className="px-3 py-2.5 text-right font-medium">Total</th>}
                {isVisible("balance") && <th className="px-3 py-2.5 text-right font-medium">Balance</th>}
                {profitByOrderId && isVisible("profit") && <th className="px-3 py-2.5 text-right font-medium">Profit</th>}
                <th className="px-3 py-2.5" />
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
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
