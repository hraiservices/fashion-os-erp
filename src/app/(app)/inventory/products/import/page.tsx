"use client";

import { ProductImportWizard } from "@/components/inventory/product-import-wizard";
import { BackLink } from "@/components/ui/back-link";

export default function ImportProductsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <BackLink href="/inventory/products">Products</BackLink>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bulk import products</h1>
        <p className="text-sm text-muted-foreground">Each row becomes one product. SKUs must be unique — duplicates and existing SKUs are flagged before import.</p>
      </div>
      <ProductImportWizard />
    </div>
  );
}
