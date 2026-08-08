import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { QuotationForm } from "@/components/sales/quotation-form";

export default function NewQuotationPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/sales/quotations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Quotations
      </Link>
      <h1 className="text-xl font-semibold">New quotation</h1>
      <QuotationForm />
    </div>
  );
}
