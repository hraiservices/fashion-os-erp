"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Entry point for the full-page Record Payment form (src/app/(app)/payments/new) — drop this in
 * anywhere staff should be able to record a payment: pass `customerMobile` to preselect that
 * customer (customer profile page), or omit it for the search-first flow (Dashboard, Orders,
 * Sales Invoices, CRM list headers). The page itself owns the customer picker, the combined
 * outstanding-orders/invoices table, and submission — this is just a link to it.
 */
export function NewPaymentButton({
  customerMobile,
  label = "New Payment",
  variant = "default",
  className,
}: {
  customerMobile?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
}) {
  const href = customerMobile ? `/payments/new?customer=${encodeURIComponent(customerMobile)}` : "/payments/new";
  return (
    <Button variant={variant} nativeButton={false} render={<Link href={href} />} className={className}>
      <Wallet className="size-4" /> {label}
    </Button>
  );
}
