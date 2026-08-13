"use client";

import { use } from "react";
import { ShoppingBag } from "lucide-react";
import { useProduct } from "@/hooks/use-products";
import { ProductForm } from "@/components/inventory/product-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: product, isLoading } = useProduct(id);

  if (isLoading) return <Skeleton className="h-screen w-full" />;
  if (!product) return <EmptyState icon={ShoppingBag} title="Product not found" />;
  return <ProductForm existing={product} />;
}
