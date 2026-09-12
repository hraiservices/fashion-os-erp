"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewPaymentDialog } from "@/components/payments/new-payment-dialog";
import { PaymentModal } from "@/components/orders/payment-modal";
import { InvoicePaymentModal } from "@/components/payments/invoice-payment-modal";
import type { Order } from "@/lib/types";
import type { SalesInvoiceWithBalance } from "@/hooks/use-sales-invoices";

/**
 * Self-contained "New Payment" entry point — drop this in anywhere staff should be able to
 * record a payment: pass `customerMobile` to skip straight to that customer's dues (customer
 * profile page), or omit it for the customer-search-first flow (Dashboard, Orders, Sales
 * Invoices, CRM list headers). Owns the whole picker → payment-modal handoff internally so
 * every call site is just this one component, no state to lift.
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMobile, setSelectedMobile] = useState<string | null>(customerMobile ?? null);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<SalesInvoiceWithBalance | null>(null);

  function open() {
    setSelectedMobile(customerMobile ?? null);
    setDialogOpen(true);
  }

  return (
    <>
      <Button variant={variant} onClick={open} className={className}>
        <Wallet className="size-4" /> {label}
      </Button>

      <NewPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedMobile={selectedMobile}
        onSelectMobile={(m) => setSelectedMobile(m || null)}
        allowCustomerChange={!customerMobile}
        onSelectOrder={(o) => {
          setDialogOpen(false);
          setPaymentOrder(o);
        }}
        onSelectInvoice={(i) => {
          setDialogOpen(false);
          setPaymentInvoice(i);
        }}
      />

      {paymentOrder && <PaymentModal order={paymentOrder} open={!!paymentOrder} onOpenChange={(v) => !v && setPaymentOrder(null)} />}
      {paymentInvoice && <InvoicePaymentModal invoice={paymentInvoice} open={!!paymentInvoice} onOpenChange={(v) => !v && setPaymentInvoice(null)} />}
    </>
  );
}
