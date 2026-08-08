"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { useRawMaterial } from "@/hooks/use-raw-materials";
import { RawMaterialForm } from "@/components/inventory/raw-material-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditRawMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: material, isLoading } = useRawMaterial(id);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/inventory/raw-materials" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Raw Materials
      </Link>
      <h1 className="text-xl font-semibold">Edit raw material</h1>
      {isLoading ? <Skeleton className="h-96 w-full" /> : !material ? <EmptyState icon={Package} title="Raw material not found" /> : <RawMaterialForm existing={material} />}
    </div>
  );
}
