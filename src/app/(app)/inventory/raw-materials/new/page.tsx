import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RawMaterialForm } from "@/components/inventory/raw-material-form";

export default function NewRawMaterialPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <Link href="/inventory/raw-materials" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Raw Materials
      </Link>
      <h1 className="text-xl font-semibold">New raw material</h1>
      <RawMaterialForm />
    </div>
  );
}
