"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductImportWizard } from "@/components/inventory/product-import-wizard";

export default function ImportProductsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/inventory/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import products</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one product. SKUs must be unique — duplicates and existing SKUs are flagged before import.</p>
      </div>
      <ProductImportWizard />
    </div>
  );
}
