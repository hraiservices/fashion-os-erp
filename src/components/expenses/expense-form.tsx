"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useCreateExpense, useUpdateExpense } from "@/hooks/use-expenses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryPicker } from "@/components/expenses/category-picker";
import { CustomerPicker, CustomerPickerTrigger } from "@/components/sales/customer-picker";
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

export function ExpenseForm({ existing }: { existing?: Expense }) {
  const router = useRouter();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const isEdit = !!existing;
  const today = new Date().toISOString().split("T")[0];

  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
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
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{isEdit ? "Edit expense" : "New expense"}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit as never)}>
        <CardContent className="space-y-5">
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Date</Label>
                <Input type="date" {...register("date")} />
                {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Amount (₹)</Label>
                <Controller
                  control={control}
                  name="amount"
                  render={({ field }) => <NumberInput step={0.01} placeholder="0.00" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
                />
                {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Category</Label>
                <Controller control={control} name="category" render={({ field }) => <CategoryPicker value={field.value} onChange={field.onChange} />} />
                {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Paid Through</Label>
                <Controller
                  control={control}
                  name="payMethod"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAY_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </section>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Customer</Label>
              {customer && (
                <button type="button" onClick={() => setCustomer(null)} className="text-xs text-muted-foreground hover:text-foreground">
                  Clear
                </button>
              )}
            </div>
            <CustomerPickerTrigger customerName={customer?.name || ""} onClick={() => setCustomerPickerOpen(true)} />
            <p className="text-xs text-muted-foreground">Optional — link this expense to a customer (e.g. a reimbursable or billable cost).</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea rows={2} placeholder="Optional details…" {...register("description")} />
          </div>
        </CardContent>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Save Expense"}
          </Button>
        </div>
      </form>

      <CustomerPicker open={customerPickerOpen} onOpenChange={setCustomerPickerOpen} onSelect={handleSelectCustomer} />
    </Card>
  );
}
