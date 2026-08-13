"use client";

import { use } from "react";
import { Package } from "lucide-react";
import { useRawMaterial } from "@/hooks/use-raw-materials";
import { RawMaterialForm } from "@/components/inventory/raw-material-form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function EditRawMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: material, isLoading } = useRawMaterial(id);

  if (isLoading) return <Skeleton className="h-screen w-full" />;
  if (!material) return <EmptyState icon={Package} title="Raw material not found" />;
  return <RawMaterialForm existing={material} />;
}
