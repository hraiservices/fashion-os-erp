"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OrderForm } from "@/components/orders/order-form";
import { Skeleton } from "@/components/ui/skeleton";

function NewOrderContent() {
  const searchParams = useSearchParams();
  const mobile = searchParams.get("mobile") ?? undefined;
  const prefillName = searchParams.get("name") ?? undefined;
  const leadId = searchParams.get("leadId") ?? undefined;
  const isAlteration = searchParams.get("type") === "alteration";
  // Carried over from a lead (see /api/targets/leads/[id]/convert): needed-by date, outfit and pieces, sizes.
  const needed = searchParams.get("needed");
  const prefillDelivery = needed && /^\d{4}-\d{2}-\d{2}$/.test(needed) ? needed : undefined;
  const prefillSpecial = searchParams.get("note")?.slice(0, 1000) || undefined;
  const outfit = searchParams.get("outfit")?.slice(0, 80) || undefined;
  const pieces = Math.min(10, Math.max(0, parseInt(searchParams.get("pieces") || "0", 10) || 0));

  // From an AI quote on a lead: "Designer Blouse:2,Simple Suit:1" (types that are not on the rate card are dropped by the form).
  const prefillGarments = (searchParams.get("garments") || "")
    .split(",")
    .map((part) => {
      const i = part.lastIndexOf(":");
      return i > 0 ? { type: part.slice(0, i).trim().slice(0, 80), qty: Math.min(10, Math.max(1, parseInt(part.slice(i + 1), 10) || 1)) } : null;
    })
    .filter((g): g is { type: string; qty: number } => !!g && !!g.type)
    .slice(0, 8);

  return <OrderForm prefillMobile={mobile} prefillName={prefillName} leadId={leadId} initialOrderType={isAlteration ? "alteration" : "new"} prefillDelivery={prefillDelivery} prefillSpecial={prefillSpecial} prefillOutfit={outfit ? { type: outfit, pieces } : undefined} prefillGarments={prefillGarments.length ? prefillGarments : undefined} />;
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={<Skeleton className="h-screen w-full" />}>
      <NewOrderContent />
    </Suspense>
  );
}
