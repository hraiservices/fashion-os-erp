"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { User, MapPin, Ruler } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSaveCustomer } from "@/hooks/use-customer-mutations";
import { useMeasureFields } from "@/hooks/use-measure-fields";
import { useCurrentUser } from "@/hooks/use-current-user";
import { blankMeasurements, toMKey } from "@/lib/measurements";
import { PAYMENT_TERMS, PAYMENT_TERM_LABELS, type PaymentTerm } from "@/lib/payment-terms";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  mobile: z.string().min(10, "Enter a valid 10-digit mobile number").max(10, "Mobile must be 10 digits"),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  dob: z.string().optional(),
  anniversary: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  paymentTerms: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const paymentTermLabel = (v: unknown) => PAYMENT_TERM_LABELS[v as PaymentTerm] ?? "";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function CustomerForm() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: measureFields } = useMeasureFields();
  const saveCustomer = useSaveCustomer();

  const [measurements, setMeasurements] = useState<Record<string, string>>(() => blankMeasurements(measureFields || []));

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", mobile: "", email: "", dob: "", anniversary: "", address: "", notes: "", paymentTerms: "due_on_receipt" },
  });

  async function onSubmit(values: FormValues) {
    const measurePayload = Object.fromEntries(Object.entries(measurements).filter(([, v]) => v.trim() !== ""));
    try {
      await saveCustomer.mutateAsync({
        name: values.name,
        mobile: values.mobile,
        email: values.email || "",
        dob: values.dob || "",
        anniversary: values.anniversary || "",
        address: values.address || "",
        notes: values.notes || "",
        paymentTerms: values.paymentTerms || "due_on_receipt",
        measurements: measurePayload,
        userEmail: user?.email,
      });
      toast.success(`${values.name} added`);
      router.push("/crm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save customer");
    }
  }

  const fields = measureFields || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">New customer</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-5">
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <User className="size-3.5" /> Basic info
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name *" error={errors.name?.message}>
                <Input placeholder="e.g. Priya Sharma" {...register("name")} />
              </Field>
              <Field label="Mobile number *" error={errors.mobile?.message}>
                <Input type="tel" placeholder="10-digit" maxLength={10} {...register("mobile")} />
              </Field>
              <Field label="Email" error={errors.email?.message}>
                <Input type="email" placeholder="priya@example.com" {...register("email")} />
              </Field>
              <Field label="Date of birth">
                <Input type="date" {...register("dob")} />
              </Field>
              <Field label="Anniversary">
                <Input type="date" {...register("anniversary")} />
              </Field>
              <Field label="Payment terms">
                <Controller
                  control={control}
                  name="paymentTerms"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue>{paymentTermLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_TERMS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {PAYMENT_TERM_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <MapPin className="size-3.5" /> Address & notes
            </div>
            <div className="space-y-3">
              <Field label="Address">
                <Textarea placeholder="House no., street, city, pincode…" rows={2} {...register("address")} />
              </Field>
              <Field label="Notes">
                <Textarea placeholder="Fit preferences, fabric choices, anything special…" rows={2} {...register("notes")} />
              </Field>
            </div>
          </section>

          {fields.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Ruler className="size-3.5" /> Measurements
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {fields.map((label) => {
                  const key = toMKey(label);
                  return (
                    <div key={key} className="space-y-1">
                      <label className="block text-[11px] font-medium text-muted-foreground">{label}</label>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder="—"
                        className="h-8 text-sm"
                        value={measurements[key] ?? ""}
                        onChange={(e) => setMeasurements((m) => ({ ...m, [key]: e.target.value }))}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </CardContent>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Add customer"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
