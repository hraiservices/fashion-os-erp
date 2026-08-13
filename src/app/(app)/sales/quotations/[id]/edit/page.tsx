"use client";

import { use } from "react";
import { FileText } from "lucide-react";
import { useSalesQuotation } from "@/hooks/use-sales-quotations";
import { QuotationForm } from "@/components/sales/quotation-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: quote, isLoading } = useSalesQuotation(id);

  if (isLoading) return <Skeleton className="h-screen w-full" />;
  if (!quote) return <EmptyState icon={FileText} title="Quotation not found" />;
  return <QuotationForm existing={quote} />;
}
