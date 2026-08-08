import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomerForm } from "@/components/crm/customer-form";

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/crm" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Customers
      </Link>
      <h1 className="text-xl font-semibold">New customer</h1>
      <CustomerForm />
    </div>
  );
}
