"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OrderImportWizard } from "@/components/orders/order-import-wizard";

export default function ImportOrdersPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Orders
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import orders</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one new stitching order.</p>
      </div>
      <OrderImportWizard />
    </div>
  );
}
