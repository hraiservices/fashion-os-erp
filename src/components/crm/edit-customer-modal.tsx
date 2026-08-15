"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { User, MapPin, Ruler, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagPicker } from "@/components/ui/tag-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { useSaveCustomer } from "@/hooks/use-customer-mutations";
import { useMeasureFields } from "@/hooks/use-measure-fields";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePriceLists } from "@/hooks/use-price-lists";
import { hydrateMeasurements, toMKey } from "@/lib/measurements";
import { PAYMENT_TERMS, PAYMENT_TERM_LABELS, type PaymentTerm } from "@/lib/payment-terms";
import type { CustomerProfile } from "@/lib/crm";

const NO_PRICE_LIST = "__none__";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  mobile: z.string().min(10, "Enter a valid mobile number"),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  dob: z.string().optional(),
  anniversary: z.string().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  notes: z.string().optional(),
  paymentTerms: z.string().optional(),
  priceListId: z.string().optional(),
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

/** EditCustomerModal(), Stitching_Manager_Pro_v16.html ~line 7195. */
export function EditCustomerModal({ cust, open, onOpenChange }: { cust: CustomerProfile; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: user } = useCurrentUser();
  const { data: measureFields } = useMeasureFields();
  const { data: priceLists } = usePriceLists();
  const saveCustomer = useSaveCustomer();
  const fields = measureFields || [];

  const [measurements, setMeasurements] = useState<Record<string, string>>(() =>
    hydrateMeasurements(fields, cust.measurements)
  );
  const [measureOpen, setMeasureOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(cust.tags || []);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: cust.name,
      mobile: cust.mobile,
      email: cust.email || "",
      dob: cust.dob || "",
      anniversary: cust.anniversary || "",
      address: cust.address || "",
      gstin: cust.gstin || "",
      notes: cust.notes || "",
      paymentTerms: cust.paymentTerms || "due_on_receipt",
      priceListId: cust.priceListId || NO_PRICE_LIST,
    },
  });

  async function onSubmit(values: FormValues) {
    const measurePayload = Object.fromEntries(
      Object.entries(measurements).filter(([, v]) => v.trim() !== "")
    );
    try {
      await saveCustomer.mutateAsync({
        ...values,
        // Customer id is derived from the mobile, so changing it re-keys the record.
        // Send the original so the server migrates loyalty + orders instead of
        // stranding them on an orphaned row.
        originalMobile: cust.mobile,
        email: values.email || "",
        dob: values.dob || "",
        anniversary: values.anniversary || "",
        address: values.address || "",
        gstin: values.gstin || "",
        notes: values.notes || "",
        paymentTerms: values.paymentTerms || "due_on_receipt",
        priceListId: values.priceListId && values.priceListId !== NO_PRICE_LIST ? values.priceListId : null,
        measurements: measurePayload,
        tags,
        userEmail: user?.email,
      });
      toast.success("Profile saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save profile");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg overflow-hidden">
        <DialogHeader className="border-b px-5 py-4 shrink-0">
          <DialogTitle>Edit customer</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

            {/* ── Basic info ── */}
            <section>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <User className="size-3.5" /> Basic info
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Full name *" error={errors.name?.message}>
                  <Input {...register("name")} />
                </Field>
                <Field label="Mobile number *" error={errors.mobile?.message}>
                  <Input type="tel" maxLength={10} {...register("mobile")} />
                </Field>
                <Field label="Email" error={errors.email?.message}>
                  <Input type="email" placeholder="email@example.com" {...register("email")} />
                </Field>
                <Field label="Date of birth">
                  <Controller control={control} name="dob" render={({ field }) => <DatePicker value={field.value || ""} onChange={field.onChange} />} />
                </Field>
                <Field label="Anniversary">
                  <Controller control={control} name="anniversary" render={({ field }) => <DatePicker value={field.value || ""} onChange={field.onChange} />} />
                </Field>
                <Field label="Payment terms">
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
                            <SelectItem key={t} value={t}>
                              {PAYMENT_TERM_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field label="Price list">
                  <Controller
                    control={control}
                    name="priceListId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                        <SelectTrigger className="h-10 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_PRICE_LIST}>Default pricing</SelectItem>
                          {(priceLists || []).map((pl) => (
                            <SelectItem key={pl.id} value={pl.id}>
                              {pl.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Tags">
                  <TagPicker value={tags} onChange={setTags} />
                </Field>
              </div>
            </section>

            {/* ── Address & notes ── */}
            <section>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <MapPin className="size-3.5" /> Address & notes
              </div>
              <div className="space-y-3">
                <Field label="Address">
                  <Textarea placeholder="House no., street, city, pincode…" rows={2} {...register("address")} />
                </Field>
                <Field label="GSTIN">
                  <Input placeholder="e.g. 09ABCDE1234F1Z5" className="uppercase" {...register("gstin")} />
                </Field>
                <Field label="Notes">
                  <Textarea placeholder="Fit preferences, fabric choices, anything special…" rows={2} {...register("notes")} />
                </Field>
              </div>
            </section>

            {/* ── Measurements (collapsible) ── */}
            {fields.length > 0 && (
              <section>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-left"
                  onClick={() => setMeasureOpen((v) => !v)}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Ruler className="size-3.5" /> Measurements
                    {Object.values(measurements).some((v) => v.trim()) && (
                      <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        {Object.values(measurements).filter((v) => v.trim()).length} filled
                      </span>
                    )}
                  </div>
                  {measureOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                </button>

                {measureOpen && (
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
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
                )}
              </section>
            )}
          </div>

          <DialogFooter className="mx-0 mb-0 border-t px-5 py-3 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
