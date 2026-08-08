import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WorkOrderForm } from "@/components/manufacturing/work-order-form";

export default function NewWorkOrderPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/manufacturing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Work orders
      </Link>
      <h1 className="text-xl font-semibold">New work order</h1>
      <WorkOrderForm />
    </div>
  );
}
