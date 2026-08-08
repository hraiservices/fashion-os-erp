import { OutstandingBalanceWidget } from "@/components/dashboard/widgets/outstanding-balance-widget";
import { TotalRevenueWidget } from "@/components/dashboard/widgets/total-revenue-widget";
import { RevenueFlowWidget } from "@/components/dashboard/widgets/revenue-flow-widget";
import { PipelineWidget } from "@/components/dashboard/widgets/pipeline-widget";
import { MonthlyOverviewWidget } from "@/components/dashboard/widgets/monthly-overview-widget";
import { TopExpensesWidget } from "@/components/dashboard/widgets/top-expenses-widget";
import { PendingPaymentsWidget } from "@/components/dashboard/widgets/pending-payments-widget";
import { NeedsAttentionWidget } from "@/components/dashboard/widgets/needs-attention-widget";
import { RecentOrdersWidget } from "@/components/dashboard/widgets/recent-orders-widget";
import { TailorLoadWidget } from "@/components/dashboard/widgets/tailor-load-widget";
import {
  StitchingDuesWidget,
  SalesDuesWidget,
  TotalReceivableWidget,
  InventoryValueWidget,
  LowStockItemsWidget,
  PurchasesPayableWidget,
  ManufacturingActiveWidget,
  ManufacturingCostWidget,
} from "@/components/dashboard/widgets/kpi-widgets";

/** Maps a builtin widget key to its render component — the single source of truth the dashboard grid renders from. */
export const WIDGET_COMPONENTS: Record<string, React.ComponentType> = {
  "outstanding-balance": OutstandingBalanceWidget,
  "total-revenue": TotalRevenueWidget,
  "stitching-dues": StitchingDuesWidget,
  "sales-dues": SalesDuesWidget,
  "total-receivable": TotalReceivableWidget,
  "inventory-value": InventoryValueWidget,
  "low-stock-items": LowStockItemsWidget,
  "purchases-payable": PurchasesPayableWidget,
  "manufacturing-active": ManufacturingActiveWidget,
  "manufacturing-cost": ManufacturingCostWidget,
  "revenue-flow": RevenueFlowWidget,
  pipeline: PipelineWidget,
  "monthly-overview": MonthlyOverviewWidget,
  "top-expenses": TopExpensesWidget,
  "pending-payments": PendingPaymentsWidget,
  "needs-attention": NeedsAttentionWidget,
  "recent-orders": RecentOrdersWidget,
  "tailor-load": TailorLoadWidget,
};
