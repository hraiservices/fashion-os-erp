import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VendorForm } from "@/components/purchases/vendor-form";

export default function NewVendorPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/purchases/vendors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Vendors
      </Link>
      <h1 className="text-xl font-semibold">New vendor</h1>
      <VendorForm />
    </div>
  );
}
