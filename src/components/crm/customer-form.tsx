"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, User, MapPin, Ruler, Save } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagPicker } from "@/components/ui/tag-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
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

export function CustomerForm() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: measureFields } = useMeasureFields();
  const saveCustomer = useSaveCustomer();

  const [measurements, setMeasurements] = useState<Record<string, string>>(() => blankMeasurements(measureFields || []));
  const [tags, setTags] = useState<string[]>([]);
  const [addressOpen, setAddressOpen] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);

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
        tags,
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
    <form onSubmit={handleSubmit(onSubmit)} className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/crm" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Customers</span>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold truncate">New Customer</h1>
          </div>
          {/* Duplicate of the bottom FormActionBar — mobile only, so Add Customer is
             reachable without scrolling all the way down. */}
          <div className="flex items-center gap-2 sm:hidden">
            <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="gap-1.5" disabled={isSubmitting}>
              <Save className="size-3.5" />
              {isSubmitting ? "Saving…" : "Add"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-5">
        {/* Basic info */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={User} label="Basic info" />
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Full name" required error={errors.name?.message}>
                <Input placeholder="e.g. Priya Sharma" className="h-10" {...register("name")} />
              </FieldGroup>
              <FieldGroup label="Mobile number" required error={errors.mobile?.message}>
                <Input type="tel" placeholder="10-digit" maxLength={10} className="h-10" {...register("mobile")} />
              </FieldGroup>
              <FieldGroup label="Email" error={errors.email?.message}>
                <Input type="email" placeholder="priya@example.com" className="h-10" {...register("email")} />
              </FieldGroup>
              <FieldGroup label="Payment terms">
                <Controller
                  control={control}
                  name="paymentTerms"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue>{paymentTermLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_TERMS.map((t) => (
                          <SelectItem key={t} value={t}>{PAYMENT_TERM_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FieldGroup>
              <FieldGroup label="Date of birth">
                <Controller control={control} name="dob" render={({ field }) => <DatePicker value={field.value || ""} onChange={field.onChange} />} />
              </FieldGroup>
              <FieldGroup label="Anniversary">
                <Controller control={control} name="anniversary" render={({ field }) => <DatePicker value={field.value || ""} onChange={field.onChange} />} />
              </FieldGroup>
            </div>
            <FieldGroup label="Tags" hint="Useful for filtering and segmenting customers.">
              <TagPicker value={tags} onChange={setTags} />
            </FieldGroup>
          </div>
        </div>

        {/* Address & notes */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <Accordion value={addressOpen ? ["address"] : []} onValueChange={(v) => setAddressOpen(v.includes("address"))}>
            <AccordionItem value="address" className="border-b-0">
              <AccordionTrigger className="border-b pb-2 mb-4 hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                    <MapPin className="size-3.5 text-primary" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Address & notes</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <FieldGroup label="Address">
                    <Textarea placeholder="House no., street, city, pincode…" rows={2} className="resize-none" {...register("address")} />
                  </FieldGroup>
                  <FieldGroup label="Notes" hint="Fit preferences, fabric choices, anything special.">
                    <Textarea placeholder="Customer preferences, special instructions…" rows={2} className="resize-none" {...register("notes")} />
                  </FieldGroup>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Measurements */}
        {fields.length > 0 && (
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <Accordion value={measureOpen ? ["measurements"] : []} onValueChange={(v) => setMeasureOpen(v.includes("measurements"))}>
              <AccordionItem value="measurements" className="border-b-0">
                <AccordionTrigger className="border-b pb-2 mb-4 hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                      <Ruler className="size-3.5 text-primary" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Measurements</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    {fields.map((label) => {
                      const key = toMKey(label);
                      return (
                        <div key={key} className="space-y-1.5">
                          <label className="block text-[11px] font-medium text-muted-foreground">{label}</label>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={0.5}
                            placeholder="—"
                            className="h-9 text-sm"
                            value={measurements[key] ?? ""}
                            onChange={(e) => setMeasurements((m) => ({ ...m, [key]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}
      </div>

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
          {isSubmitting ? "Saving…" : "Add Customer"}
        </Button>
      </FormActionBar>
    </form>
  );
}
