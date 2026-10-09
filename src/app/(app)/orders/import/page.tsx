"use client";

import { OrderImportWizard } from "@/components/orders/order-import-wizard";
import { BackLink } from "@/components/ui/back-link";

export default function ImportOrdersPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <BackLink href="/orders">Orders</BackLink>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import orders</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one new stitching order.</p>
      </div>
      <OrderImportWizard />
    </div>
  );
}
