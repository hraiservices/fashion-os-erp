"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2, User, Shirt, Wallet, Ruler, Gift, Check, Search } from "lucide-react";
import { useCreateOrder, useUpdateOrder } from "@/hooks/use-order-mutations";
import { CustomerPicker } from "@/components/sales/customer-picker";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useActiveTailorNames } from "@/hooks/use-employees";
import { useMeasureFields } from "@/hooks/use-measure-fields";
import { useCustomerByMobile } from "@/hooks/use-customer";
import { useLoyaltyConfig } from "@/hooks/use-loyalty-config";
import { DEFAULT_RATES, LINING_LABELS, computeRedemption, loyaltyTier, type Lining } from "@/lib/business-rules";
import { hydrateMeasurements, compactMeasurements, toMKey, type MeasureLang } from "@/lib/measurements";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Order, OrderType } from "@/lib/types";
import { MeasurementGrid } from "@/components/measurements/measurement-grid";
import { MediaCapture } from "@/components/orders/media-capture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";

const garmentSchema = z.object({
  type: z.string().min(1, "Select a garment"),
  lining: z.string().min(1),
  no: z.number().min(1),
  amount: z.number().min(0),
});

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  mobile: z.string().min(10, "Enter a valid 10-digit mobile number"),
  inDate: z.string().min(1),
  deliveryDate: z.string().min(1, "Delivery date is required"),
  tailor: z.string(),
  special: z.string(),
  advance: z.number().min(0),
  paymentMethod: z.string(),
  garments: z.array(garmentSchema).min(1, "Add at least one garment"),
});

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer"];

type FormValues = z.infer<typeof formSchema>;
type RateCard = Record<string, Record<Lining, number>>;

const LININGS = Object.keys(LINING_LABELS) as Lining[];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Waits for shop config (rate card, tailors, measurement fields) before mounting the form —
 * react-hook-form captures defaultValues once at first render, so mounting early would lock
 * in a stale/hardcoded rate card for a new order.
 */
export function OrderForm({ existingOrder, prefillMobile, initialOrderType }: { existingOrder?: Order; prefillMobile?: string; initialOrderType?: OrderType }) {
  const { data: rates, isLoading: ratesLoading } = useAppSetting<RateCard>("rates", DEFAULT_RATES);
  const { data: tailors, isLoading: tailorsLoading } = useActiveTailorNames();
  const { data: measureFields, isLoading: fieldsLoading } = useMeasureFields();

  if (ratesLoading || tailorsLoading || fieldsLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <OrderFormFields
      existingOrder={existingOrder}
      prefillMobile={prefillMobile}
      initialOrderType={initialOrderType}
      rates={rates || DEFAULT_RATES}
      tailors={tailors || []}
      measureFields={measureFields || []}
    />
  );
}

function Section({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: typeof User;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function OrderFormFields({
  existingOrder,
  prefillMobile,
  initialOrderType,
  rates,
  tailors,
  measureFields,
}: {
  existingOrder?: Order;
  prefillMobile?: string;
  initialOrderType?: OrderType;
  rates: RateCard;
  tailors: string[];
  measureFields: string[];
}) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: loyaltyCfg } = useLoyaltyConfig();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();

  const garmentTypes = Object.keys(rates);
  const defaultGarmentType = garmentTypes[0] || "";
  const defaultTailor = tailors[0] || "";

  const [orderType, setOrderType] = useState<OrderType>(existingOrder?.orderType || initialOrderType || "new");
  const isAlteration = orderType === "alteration";

  const [measurements, setMeasurements] = useState<Record<string, string>>(() =>
    hydrateMeasurements(measureFields, existingOrder?.measurements)
  );
  const [measureLang, setMeasureLang] = useState<MeasureLang>("en");
  const [images, setImages] = useState<string[]>(existingOrder?.images || []);
  const [audios, setAudios] = useState<string[]>(existingOrder?.audios || []);
  const [videos, setVideos] = useState<string[]>(existingOrder?.videos || []);
  const [usePoints, setUsePoints] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(!isAlteration);
  const [pickerOpen, setPickerOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existingOrder
      ? {
          name: existingOrder.name,
          mobile: existingOrder.mobile,
          inDate: existingOrder.inDate || todayISO(),
          deliveryDate: existingOrder.deliveryDate,
          tailor: existingOrder.tailor,
          special: existingOrder.special,
          advance: existingOrder.advance,
          paymentMethod: "Cash",
          garments:
            existingOrder.garments.length > 0
              ? existingOrder.garments.map((g) => ({ type: g.type, lining: g.lining || "s", no: g.no || 1, amount: g.amount || 0 }))
              : [{ type: defaultGarmentType, lining: "s", no: 1, amount: rates[defaultGarmentType]?.s || 0 }],
        }
      : {
          name: "",
          mobile: prefillMobile ?? "",
          inDate: todayISO(),
          deliveryDate: "",
          tailor: defaultTailor,
          special: "",
          advance: 0,
          paymentMethod: "Cash",
          garments: [{ type: defaultGarmentType, lining: "s", no: 1, amount: rates[defaultGarmentType]?.s || 0 }],
        },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "garments" });
  const garments = watch("garments");
  const advance = watch("advance") || 0;
  const mobile = watch("mobile");
  const total = garments.reduce((s, g) => s + (g.amount || 0) * (g.no || 1), 0);

  // Look up an existing customer once the mobile number is complete, so we can offer to
  // reuse their saved measurements and redeem their loyalty points (old app: fillCust()).
  const lookupMobile = !existingOrder && mobile?.length === 10 ? mobile : "";
  const { data: foundCustomer } = useCustomerByMobile(lookupMobile);

  useEffect(() => {
    if (!foundCustomer || existingOrder || prefilled) return;
    setValue("name", foundCustomer.name, { shouldValidate: true });
    const saved = hydrateMeasurements(measureFields, foundCustomer.measurements);
    setMeasurements(saved);
    setPrefilled(true);
    toast.success(`Loaded ${foundCustomer.name}'s details`);
  }, [foundCustomer, existingOrder, prefilled, measureFields, setValue]);

  // Reset the prefill latch if the number is edited, so a different customer re-triggers it.
  useEffect(() => {
    if (mobile?.length !== 10) setPrefilled(false);
  }, [mobile]);

  const balanceBeforePoints = Math.max(0, total - advance);
  const availablePoints = loyaltyCfg?.enabled ? foundCustomer?.loyaltyPoints || 0 : 0;
  const redemption = loyaltyCfg
    ? computeRedemption(availablePoints, balanceBeforePoints, loyaltyCfg)
    : { canRedeem: false, maxPtDiscount: 0, ptsToRedeem: 0 };
  const ptDiscount = usePoints && redemption.canRedeem ? redemption.maxPtDiscount : 0;
  const balance = Math.max(0, balanceBeforePoints - ptDiscount);
  const tier = loyaltyCfg?.enabled && foundCustomer ? loyaltyTier(foundCustomer.totalEarned, loyaltyCfg) : null;

  function applyRate(index: number, type: string, lining: string) {
    const rate = rates[type]?.[lining as Lining];
    if (rate != null) setValue(`garments.${index}.amount`, rate);
  }

  useEffect(() => {
    if (existingOrder) return;
    applyRate(0, defaultGarmentType, "s");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit({ paymentMethod, ...values }: FormValues) {
    const measurementPayload = compactMeasurements(measurements);
    try {
      if (existingOrder) {
        await updateOrder.mutateAsync({
          id: existingOrder.id,
          patch: {
            ...values,
            total,
            garments: values.garments as Order["garments"],
            measurements: measurementPayload,
            images,
            audios,
            videos,
            orderType,
          },
          userEmail: user?.email,
        });
        toast.success("Order updated");
        router.push(`/orders/${existingOrder.id}`);
      } else {
        const res = await createOrder.mutateAsync({
          ...values,
          total,
          measurements: measurementPayload,
          images,
          audios,
          videos,
          usePoints,
          orderType,
          paymentMethod: values.advance > 0 ? paymentMethod : undefined,
        });
        toast.success(res.ptDiscount > 0 ? `Order ${res.order.id} created · ${inr(res.ptDiscount)} points discount applied` : `Order ${res.order.id} created`);
        if (res.limitWarning) toast.warning(res.limitWarning);
        router.push(`/orders/${res.order.id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save order");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="pb-32 lg:pb-0">
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4 lg:col-span-2">
          <Section
            icon={User}
            title="Customer"
            description="Who is this order for?"
            action={
              !existingOrder && (
                <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                  <Search className="size-3.5" /> Find customer
                </Button>
              )
            }
          >
            {!existingOrder && (
              <div className="mb-4">
                <SegmentedToggle
                  ariaLabel="Order type"
                  value={orderType}
                  onChange={setOrderType}
                  options={[
                    { value: "new", label: "New order" },
                    { value: "alteration", label: "Alteration / rework" },
                  ]}
                />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile" error={errors.mobile?.message}>
                <Input {...register("mobile")} maxLength={10} inputMode="numeric" placeholder="10-digit number" autoComplete="tel" />
              </Field>
              <Field label="Name" error={errors.name?.message}>
                <Input {...register("name")} placeholder="Customer name" autoComplete="name" />
              </Field>
              <Field label="Order date">
                <Input type="date" {...register("inDate")} />
              </Field>
              <Field label="Delivery date" error={errors.deliveryDate?.message}>
                <Input type="date" {...register("deliveryDate")} />
              </Field>
              <Field label="Tailor" className="sm:col-span-2">
                {tailors.length > 0 ? (
                  <Controller
                    control={control}
                    name="tailor"
                    render={({ field: f }) => (
                      <Select value={f.value} onValueChange={(v) => v && f.onChange(v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Assign a tailor" />
                        </SelectTrigger>
                        <SelectContent>
                          {tailors.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                ) : (
                  <Input {...register("tailor")} placeholder="Add tailors in Employees" />
                )}
              </Field>
              <Field label="Special instructions" className="sm:col-span-2">
                <Textarea {...register("special")} rows={2} placeholder="Anything the tailor should know…" />
              </Field>
            </div>

            {foundCustomer && !existingOrder && (
              <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Returning customer</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {tier ? `${tier.label} · ` : ""}
                  {foundCustomer.loyaltyPoints} points available
                </p>
              </div>
            )}
          </Section>

          {measureFields.length > 0 && (
            <Section
              icon={Ruler}
              title="Measurements"
              description={prefilled ? "Loaded from this customer's saved profile — edit as needed." : "Saved to the customer for next time."}
              action={
                isAlteration ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setMeasureOpen((v) => !v)}>
                    {measureOpen ? "Hide" : "Add measurements"}
                  </Button>
                ) : undefined
              }
            >
              {(!isAlteration || measureOpen) && (
                <MeasurementGrid
                  fields={measureFields}
                  values={measurements}
                  onChange={(key, value) => setMeasurements((m) => ({ ...m, [key]: value }))}
                  lang={measureLang}
                  onLangChange={setMeasureLang}
                />
              )}
            </Section>
          )}

          <Section icon={Shirt} title="Garments" description="Rates auto-fill from your rate card and stay editable.">
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-lg border p-3">
                  <div className="grid gap-3 sm:grid-cols-12">
                    <Field label="Type" className="sm:col-span-4">
                      <Controller
                        control={control}
                        name={`garments.${index}.type`}
                        render={({ field: f }) => (
                          <Select
                            value={f.value}
                            onValueChange={(v) => {
                              if (!v) return;
                              f.onChange(v);
                              applyRate(index, v, garments[index]?.lining || "s");
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {garmentTypes.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                    <Field label="Lining" className="sm:col-span-3">
                      <Controller
                        control={control}
                        name={`garments.${index}.lining`}
                        render={({ field: f }) => (
                          <Select
                            value={f.value}
                            onValueChange={(v) => {
                              if (!v) return;
                              f.onChange(v);
                              applyRate(index, garments[index]?.type || defaultGarmentType, v);
                            }}
                          >
                            <SelectTrigger className="w-full">
                              {/* Base UI renders the raw value unless given a formatter ("s" not "Simple"). */}
                              <SelectValue>{(v) => LINING_LABELS[v as Lining] ?? v}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {LININGS.map((l) => (
                                <SelectItem key={l} value={l}>
                                  {LINING_LABELS[l]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                    <Field label="Qty" className="sm:col-span-2">
                      <Input type="number" min={1} inputMode="numeric" {...register(`garments.${index}.no`, { valueAsNumber: true })} />
                    </Field>
                    <Field label="Rate" className="sm:col-span-2">
                      <Input type="number" min={0} inputMode="numeric" {...register(`garments.${index}.amount`, { valueAsNumber: true })} />
                    </Field>
                    <div className="flex items-end sm:col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-9 sm:size-8"
                        aria-label={`Remove garment ${index + 1}`}
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-right text-xs text-muted-foreground">
                    Line total <span className="font-medium tabular-nums text-foreground">{inr((garments[index]?.amount || 0) * (garments[index]?.no || 1))}</span>
                  </p>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => append({ type: defaultGarmentType, lining: "s", no: 1, amount: rates[defaultGarmentType]?.s || 0 })}
              >
                <Plus className="size-4" /> Add garment
              </Button>
              {errors.garments && <p className="text-xs text-destructive">{errors.garments.message as string}</p>}
            </div>
          </Section>

          <MediaCapture images={images} audios={audios} videos={videos} onImagesChange={setImages} onAudiosChange={setAudios} onVideosChange={setVideos} />
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <Section icon={Wallet} title="Payment">
            {!existingOrder && redemption.canRedeem && (
              <button
                type="button"
                onClick={() => setUsePoints((u) => !u)}
                className={cn(
                  "mb-4 flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  usePoints ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded border-2",
                    usePoints ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                  )}
                >
                  {usePoints && <Check className="size-3.5" />}
                </span>
                <Gift className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Redeem loyalty points</p>
                  <p className="text-xs text-muted-foreground">
                    {availablePoints} available — saves {inr(redemption.maxPtDiscount)} using {redemption.ptsToRedeem} pts
                  </p>
                </div>
              </button>
            )}

            <div className="space-y-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums">{inr(total)}</p>
              </div>
              <Field label="Advance received">
                <Controller
                  control={control}
                  name="advance"
                  render={({ field }) => (
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="0"
                      value={field.value ? String(field.value) : ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              </Field>
              {/* Only meaningful when creating an order — editing an existing order doesn't send
                  paymentMethod anywhere (advance changes on an existing order aren't a single new
                  payment event with one method), so showing this in edit mode would be a dropdown
                  whose value is silently discarded on save. */}
              {!existingOrder && advance > 0 && (
                <Field label="Payment method">
                  <Controller
                    control={control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              )}
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Balance</p>
                <BalanceDue amount={balance} paidLabel={inr(balance)} className="mt-0.5 block text-xl" />
                {ptDiscount > 0 && <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">after {inr(ptDiscount)} points discount</p>}
              </div>
            </div>

            <div className="mt-4 hidden gap-2 border-t pt-4 lg:flex">
              <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : existingOrder ? "Save changes" : `Create order · ${inr(total)}`}
              </Button>
            </div>
          </Section>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 flex gap-2 border-t bg-background/95 p-3 backdrop-blur lg:hidden">
        <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : existingOrder ? "Save changes" : `Create order · ${inr(total)}`}
        </Button>
      </div>

      {!existingOrder && (
        <CustomerPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(c) => {
            setValue("mobile", c.mobile, { shouldValidate: true });
            setValue("name", c.name, { shouldValidate: true });
            // The mobile/measurements/loyalty auto-prefill effect above watches `mobile` and
            // fires the moment it's a full 10 digits — picking a customer here just feeds that
            // same effect instead of duplicating its prefill logic.
          }}
        />
      )}
    </form>
  );
}
