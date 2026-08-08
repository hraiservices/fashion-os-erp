import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductForm } from "@/components/inventory/product-form";

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/inventory/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Products
      </Link>
      <h1 className="text-xl font-semibold">New product</h1>
      <ProductForm />
    </div>
  );
}
