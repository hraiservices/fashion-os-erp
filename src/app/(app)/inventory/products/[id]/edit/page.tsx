"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useProduct } from "@/hooks/use-products";
import { ProductForm } from "@/components/inventory/product-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: product, isLoading } = useProduct(id);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/inventory/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <h1 className="text-xl font-semibold">Edit product</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !product ? <EmptyState icon={ShoppingBag} title="Product not found" /> : <ProductForm existing={product} />}
    </div>
  );
}
