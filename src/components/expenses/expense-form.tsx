"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Receipt, User2, FileText, Save } from "lucide-react";
import Link from "next/link";
import { useCreateExpense, useUpdateExpense } from "@/hooks/use-expenses";
import { Button } from "@/components/ui/button";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CategoryPicker } from "@/components/expenses/category-picker";
import { CustomerPicker, CustomerPickerTrigger } from "@/components/sales/customer-picker";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import type { Customer, Expense } from "@/lib/types";

const schema = z.object({
  date: z.string().min(1, "Date required"),
  category: z.string().min(1, "Category required"),
  description: z.string().optional(),
  amount: z.coerce.number().positive("Amount must be positive"),
  payMethod: z.string().min(1, "Payment method required"),
});
type FormValues = z.infer<typeof schema>;

const PAY_METHODS = ["Cash", "UPI", "Bank Transfer", "Card", "Cheque"];

function SectionHeading({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 border-b pb-2 mb-4">
      <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
        <Icon className="size-3.5 text-primary" />
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function FieldGroup({ label, required, error, children, hint }: { label: string; required?: boolean; error?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground/80">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ExpenseForm({ existing }: { existing?: Expense }) {
  const router = useRouter();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const isEdit = !!existing;
  const today = new Date().toISOString().split("T")[0];

  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerLinkOpen, setCustomerLinkOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [customer, setCustomer] = useState<{ name: string; mobile: string } | null>(
    existing?.customerName ? { name: existing.customerName, mobile: existing.customerMobile || "" } : null
  );

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: existing
      ? { date: existing.date, category: existing.category, description: existing.description, amount: existing.amount, payMethod: existing.payMethod }
      : { date: today, category: "", description: "", amount: 0, payMethod: "Cash" },
  });

  function handleSelectCustomer(c: Customer) {
    setCustomer({ name: c.name, mobile: c.mobile });
  }

  async function onSubmit(values: FormValues) {
    try {
      const payload = { ...values, description: values.description || "", customerName: customer?.name || null, customerMobile: customer?.mobile || null };
      if (isEdit) {
        await updateExpense.mutateAsync({ id: existing!.id, ...payload });
        toast.success("Expense updated");
      } else {
        await createExpense.mutateAsync(payload);
        toast.success("Expense recorded");
      }
      router.push("/expenses");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save expense");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit as never)} className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/expenses" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Expenses</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Expense" : "New Expense"}</h1>
          </div>
          {/* Duplicate of the bottom FormActionBar — mobile only, so Record/Save is reachable
             without scrolling all the way down. */}
          <div className="flex items-center gap-2 sm:hidden">
            <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="gap-1.5" disabled={isSubmitting}>
              <Save className="size-3.5" />
              {isSubmitting ? "Saving…" : isEdit ? "Save" : "Record"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-5">
        {/* Expense details */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={Receipt} label="Expense details" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldGroup label="Date" required error={errors.date?.message}>
              <Controller control={control} name="date" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />} />
            </FieldGroup>
            <FieldGroup label="Amount (₹)" required error={errors.amount?.message}>
              <Controller
                control={control}
                name="amount"
                render={({ field }) => <NumberInput step={0.01} placeholder="0.00" className="h-10" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
              />
            </FieldGroup>
            <FieldGroup label="Category" required error={errors.category?.message}>
              <Controller control={control} name="category" render={({ field }) => <CategoryPicker value={field.value} onChange={field.onChange} />} />
            </FieldGroup>
            <FieldGroup label="Paid through" required error={errors.payMethod?.message}>
              <Controller
                control={control}
                name="payMethod"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAY_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FieldGroup>
          </div>
        </div>

        {/* Customer link */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <Accordion value={customerLinkOpen ? ["customer"] : []} onValueChange={(v) => setCustomerLinkOpen(v.includes("customer"))}>
            <AccordionItem value="customer" className="border-b-0">
              <AccordionTrigger className="border-b pb-2 mb-4 hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                    <User2 className="size-3.5 text-primary" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer link</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <FieldGroup label="Customer" hint="Optional — link this expense to a customer (e.g. a reimbursable or billable cost).">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <CustomerPickerTrigger customerName={customer?.name || ""} onClick={() => setCustomerPickerOpen(true)} />
                    </div>
                    {customer && (
                      <button type="button" onClick={() => setCustomer(null)} className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">
                        Clear
                      </button>
                    )}
                  </div>
                </FieldGroup>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Notes */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <Accordion value={notesOpen ? ["notes"] : []} onValueChange={(v) => setNotesOpen(v.includes("notes"))}>
            <AccordionItem value="notes" className="border-b-0">
              <AccordionTrigger className="border-b pb-2 mb-4 hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                    <FileText className="size-3.5 text-primary" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <FieldGroup label="Description / details">
                  <Textarea rows={3} placeholder="What was this expense for? Any additional details…" className="resize-none" {...register("description")} />
                </FieldGroup>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      <CustomerPicker open={customerPickerOpen} onOpenChange={setCustomerPickerOpen} onSelect={handleSelectCustomer} />

      <FormActionBar className="justify-start sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 px-6 text-base sm:h-7 sm:px-2.5 sm:text-[0.8rem]"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="lg"
          className="h-12 flex-1 gap-1.5 px-6 text-base sm:h-7 sm:flex-none sm:px-2.5 sm:text-[0.8rem]"
          disabled={isSubmitting}
        >
          <Save className="size-3.5" />
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Record Expense"}
        </Button>
      </FormActionBar>
    </form>
  );
}
