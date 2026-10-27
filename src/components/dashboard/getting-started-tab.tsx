"use client";

import { useState } from "react";
import { CheckCircle2, Store, Package, UserPlus, ClipboardList, Receipt, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShopSection } from "@/components/settings/shop-section";
import { CustomerForm } from "@/components/crm/customer-form";
import { OrderForm } from "@/components/orders/order-form";
import { InvoiceForm } from "@/components/sales/invoice-form";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useProducts } from "@/hooks/use-products";
import { useCustomerProfiles } from "@/hooks/use-customer-profiles";
import { useOrdersLight } from "@/hooks/use-orders-light";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { cn } from "@/lib/utils";

type StepId = "company" | "product" | "customer" | "order" | "invoice";

interface Step {
  id: StepId;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
}

const STEPS: Step[] = [
  {
    id: "company",
    icon: Store,
    title: "Set up your company profile",
    description: "Add your shop's name and logo — shown on the dashboard, invoices, and the order-status link customers see.",
    actionLabel: "Configure",
  },
  {
    id: "product",
    icon: Package,
    title: "Add your first product",
    description: "Products you sell off the shelf (not stitched to order) — used for sales invoices and inventory.",
    actionLabel: "Add product",
  },
  {
    id: "customer",
    icon: UserPlus,
    title: "Add a customer",
    description: "Customers are also created automatically from their first order, but you can add one directly here too.",
    actionLabel: "Add customer",
  },
  {
    id: "order",
    icon: ClipboardList,
    title: "Create your first stitching order",
    description: "Orders are the core of a tailoring shop's work — garments, measurements, delivery date, and payment.",
    actionLabel: "New order",
  },
  {
    id: "invoice",
    icon: Receipt,
    title: "Send your first sales invoice",
    description: "For product sales rather than stitching work — line items, tax, and a shareable payment link.",
    actionLabel: "New invoice",
  },
];

/** A fuller, Zoho-style onboarding page (vs the earlier inline checklist it replaces) — one card
 *  per step, each opening the real create/edit form in a dialog right there instead of sending
 *  staff off to a different page. "Done" is derived from live data, same checks the old inline
 *  checklist used, not a separately-tracked flag — so it can't drift from what's actually true. */
export function GettingStartedTab() {
  const { data: shop } = useShopSettings();
  const { data: products } = useProducts();
  const { profiles } = useCustomerProfiles();
  const { data: orders } = useOrdersLight();
  const { data: invoices } = useSalesInvoices();
  const [openStep, setOpenStep] = useState<StepId | null>(null);

  const doneById: Record<StepId, boolean> = {
    company: !!shop?.logoDataUrl,
    product: (products?.length || 0) > 0,
    customer: profiles.length > 0,
    order: (orders?.length || 0) > 0,
    invoice: (invoices?.length || 0) > 0,
  };
  const doneCount = STEPS.filter((s) => doneById[s.id]).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 text-center sm:p-6">
        <h2 className="text-lg font-semibold">Welcome to Fashion Flow</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {doneCount === STEPS.length ? "You're all set up — nothing left on this list." : `${doneCount} of ${STEPS.length} steps done. Work through these to get the shop ready.`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STEPS.map((step) => {
          const done = doneById[step.id];
          return (
            <Card key={step.id}>
              <CardHeader className="flex-row items-start gap-3 space-y-0">
                <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-primary/10 text-primary")}>
                  {done ? <CheckCircle2 className="size-5" /> : <step.icon className="size-5" />}
                </div>
                <CardTitle className="text-sm font-semibold leading-snug">{step.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{step.description}</p>
                <Button variant={done ? "outline" : "default"} size="sm" className="h-11 text-sm sm:h-7 sm:text-[0.8rem]" onClick={() => setOpenStep(step.id)}>
                  {done ? "Add another" : step.actionLabel}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={openStep === "company"} onOpenChange={(v) => !v && setOpenStep(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Company profile</DialogTitle>
          </DialogHeader>
          <ShopSection />
        </DialogContent>
      </Dialog>

      <ProductFormDialog open={openStep === "product"} onOpenChange={(v) => !v && setOpenStep(null)} />

      <Dialog open={openStep === "customer"} onOpenChange={(v) => !v && setOpenStep(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
          </DialogHeader>
          <CustomerForm />
        </DialogContent>
      </Dialog>

      <Dialog open={openStep === "order"} onOpenChange={(v) => !v && setOpenStep(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>New order</DialogTitle>
          </DialogHeader>
          <OrderForm />
        </DialogContent>
      </Dialog>

      <Dialog open={openStep === "invoice"} onOpenChange={(v) => !v && setOpenStep(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
          </DialogHeader>
          <InvoiceForm />
        </DialogContent>
      </Dialog>
    </div>
  );
}
