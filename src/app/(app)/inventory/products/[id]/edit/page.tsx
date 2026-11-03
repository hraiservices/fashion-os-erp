"use client";

import { use } from "react";
import { ShoppingBagDuotoneIcon } from "@/components/icons/duotone-icons";

import { useProduct, useProducts } from "@/hooks/use-products";
import { ProductForm } from "@/components/inventory/product-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailSidebarList } from "@/components/ui/detail-sidebar-list";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: product, isLoading } = useProduct(id);
  const { data: allProducts } = useProducts();

  const sidebarItems = (allProducts || []).map((p) => ({
    id: p.id,
    title: p.name,
    subtitle: p.sku,
    href: `/inventory/products/${p.id}/edit`,
  }));

  if (isLoading) return <Skeleton className="h-screen w-full" />;
  if (!product) return <EmptyState icon={ShoppingBagDuotoneIcon} title="Product not found" />;
  return (
    <div className="flex items-start gap-4 lg:p-4">
      <DetailSidebarList items={sidebarItems} activeId={id} searchPlaceholder="Search products…" emptyLabel="No products yet" showSubtitle />
      <div className="min-w-0 flex-1">
        <ProductForm existing={product} />
      </div>
    </div>
  );
}
