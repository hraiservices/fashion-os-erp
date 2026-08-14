"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, User2, Shirt, Wallet, Ruler, Gift, Check, ClipboardList } from "lucide-react";
import { useCreateOrder, useUpdateOrder } from "@/hooks/use-order-mutations";
import { CustomerPicker, CustomerPickerTrigger } from "@/components/sales/customer-picker";
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
import { DatePicker } from "@/components/ui/date-picker";

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

function SectionHeading({ icon: Icon, label, action }: { icon: React.ElementType; label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b pb-2 mb-4">
      <div className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
          <Icon className="size-3.5 text-primary" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      {action}
    </div>
  );
}

function FieldGroup({ label, required, error, children, hint, className }: { label: string; required?: boolean; error?: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-foreground/80">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {!error && hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
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
  const isEdit = !!existingOrder;

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
  const name = watch("name");
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
            // The form captured `advance` when it mounted. If a payment was collected
            // since then, the stored advance has moved on and blindly writing our stale
            // copy back would erase that payment — send what we saw so the server can
            // detect the conflict and reject instead.
            expectedAdvance: existingOrder.advance,
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
    <div className="min-h-screen bg-muted/30">
      {/* ── Page header bar ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/orders" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Orders</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Order" : isAlteration ? "New Alteration" : "New Order"}</h1>
            {isEdit && <p className="text-[11px] text-muted-foreground font-mono">{existingOrder.id}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button size="sm" className="bg-primary text-primary-foreground gap-1.5" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
              <ClipboardList className="size-3.5" />
              {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : `Create Order · ${inr(total)}`}
            </Button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        <div className="lg:col-span-2 space-y-5">
          {/* Customer & dates */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={User2} label="Customer & dates" />

            {!isEdit && (
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

            <div className="mb-4">
              <FieldGroup label="Customer" required>
                <CustomerPickerTrigger
                  customerName={name || ""}
                  onClick={() => setPickerOpen(true)}
                />
              </FieldGroup>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Mobile" required error={errors.mobile?.message}>
                <Input {...register("mobile")} maxLength={10} inputMode="numeric" placeholder="10-digit number" autoComplete="tel" className="h-10" />
              </FieldGroup>
              <FieldGroup label="Name" required error={errors.name?.message}>
                <Input {...register("name")} placeholder="Customer name" autoComplete="name" className="h-10" />
              </FieldGroup>
              <FieldGroup label="Order date" required>
                <Controller control={control} name="inDate" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />} />
              </FieldGroup>
              <FieldGroup label="Delivery date" required error={errors.deliveryDate?.message}>
                <Controller control={control} name="deliveryDate" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} placeholder="Pick delivery date" />} />
              </FieldGroup>
              <FieldGroup label="Tailor" className="sm:col-span-2">
                {tailors.length > 0 ? (
                  <Controller
                    control={control}
                    name="tailor"
                    render={({ field: f }) => (
                      <Select value={f.value} onValueChange={(v) => v && f.onChange(v)}>
                        <SelectTrigger className="h-10 w-full">
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
                  <Input {...register("tailor")} placeholder="Add tailors in Employees" className="h-10" />
                )}
              </FieldGroup>
              <FieldGroup label="Special instructions" className="sm:col-span-2">
                <Textarea {...register("special")} rows={2} placeholder="Anything the tailor should know…" />
              </FieldGroup>
            </div>

            {foundCustomer && !isEdit && (
              <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="font-medium">Returning customer</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {tier ? `${tier.label} · ` : ""}
                  {foundCustomer.loyaltyPoints} points available
                </p>
              </div>
            )}
          </div>

          {measureFields.length > 0 && (
            <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
              <SectionHeading
                icon={Ruler}
                label="Measurements"
                action={
                  isAlteration ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setMeasureOpen((v) => !v)}>
                      {measureOpen ? "Hide" : "Add measurements"}
                    </Button>
                  ) : undefined
                }
              />
              <p className="-mt-2 mb-4 text-xs text-muted-foreground">
                {prefilled ? "Loaded from this customer's saved profile — edit as needed." : "Saved to the customer for next time."}
              </p>
              {(!isAlteration || measureOpen) && (
                <MeasurementGrid
                  fields={measureFields}
                  values={measurements}
                  onChange={(key, value) => setMeasurements((m) => ({ ...m, [key]: value }))}
                  lang={measureLang}
                  onLangChange={setMeasureLang}
                />
              )}
            </div>
          )}

          {/* Garments */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Shirt} label="Garments" />
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-lg border p-3">
                  <div className="grid gap-3 sm:grid-cols-12">
                    <FieldGroup label="Type" className="sm:col-span-4">
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
                            <SelectTrigger className="h-10 w-full">
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
                    </FieldGroup>
                    <FieldGroup label="Lining" className="sm:col-span-3">
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
                            <SelectTrigger className="h-10 w-full">
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
                    </FieldGroup>
                    <FieldGroup label="Qty" className="sm:col-span-2">
                      <Input type="number" min={1} inputMode="numeric" className="h-10" {...register(`garments.${index}.no`, { valueAsNumber: true })} />
                    </FieldGroup>
                    <FieldGroup label="Rate" className="sm:col-span-2">
                      <Input type="number" min={0} inputMode="numeric" className="h-10" {...register(`garments.${index}.amount`, { valueAsNumber: true })} />
                    </FieldGroup>
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
          </div>

          <MediaCapture images={images} audios={audios} videos={videos} onImagesChange={setImages} onAudiosChange={setAudios} onVideosChange={setVideos} />
        </div>

        {/* ── Payment summary sidebar ───────────────────────────────────── */}
        <div className="mt-5 lg:mt-0 lg:sticky lg:top-[61px] space-y-4">
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm overflow-hidden">
            <div className="bg-primary px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/70">Order total</p>
              <p className="text-2xl font-bold text-primary-foreground tabular-nums">{inr(total)}</p>
            </div>

            <div className="px-5 py-4 space-y-3">
              {!isEdit && redemption.canRedeem && (
                <button
                  type="button"
                  onClick={() => setUsePoints((u) => !u)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
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

              <FieldGroup label="Advance received">
                <Controller
                  control={control}
                  name="advance"
                  render={({ field }) => (
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="0"
                      className="h-10"
                      value={field.value ? String(field.value) : ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              </FieldGroup>
              {/* Only meaningful when creating an order — editing an existing order doesn't send
                  paymentMethod anywhere (advance changes on an existing order aren't a single new
                  payment event with one method), so showing this in edit mode would be a dropdown
                  whose value is silently discarded on save. */}
              {!isEdit && advance > 0 && (
                <FieldGroup label="Payment method">
                  <Controller
                    control={control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                        <SelectTrigger className="h-10 w-full">
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
                </FieldGroup>
              )}

              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Balance</span>
                <div className="text-right">
                  <BalanceDue amount={balance} paidLabel={inr(balance)} className="block text-lg font-semibold" />
                  {ptDiscount > 0 && <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">after {inr(ptDiscount)} points discount</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {!isEdit && (
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
    </div>
  );
}
