import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PurchaseOrderForm } from "@/components/purchases/purchase-order-form";

export default function NewPurchaseOrderPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/purchases/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Purchase orders
      </Link>
      <h1 className="text-xl font-semibold">New purchase order</h1>
      <PurchaseOrderForm />
    </div>
  );
}
