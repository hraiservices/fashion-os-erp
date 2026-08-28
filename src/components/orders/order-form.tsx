"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, User2, Shirt, Wallet, Ruler, Gift, Check, ClipboardList, AlertTriangle, Receipt, TrendingUp, TrendingDown } from "lucide-react";
import { useCreateOrder, useUpdateOrder } from "@/hooks/use-order-mutations";
import { useOrders } from "@/hooks/use-orders";
import { useOrderExpensesFor } from "@/hooks/use-order-expenses";
import { CustomerPicker } from "@/components/sales/customer-picker";
import { SearchSelect } from "@/components/ui/search-select";
import { useCustomers } from "@/hooks/use-customers";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useActiveTailors } from "@/hooks/use-employees";
import { useMeasureFields } from "@/hooks/use-measure-fields";
import { useCustomerByMobile } from "@/hooks/use-customer";
import { useLoyaltyConfig } from "@/hooks/use-loyalty-config";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { getTailorWorkload } from "@/lib/analytics";
import {
  DEFAULT_RATES,
  DEFAULT_TAILOR_RATES,
  DEFAULT_EXPENSE_CATEGORIES,
  LINING_LABELS,
  BOOKING_SOURCES,
  REFERRAL_COUPON_DISCOUNT,
  computeRedemption,
  loyaltyTier,
  type Lining,
  type TailorRateCard,
} from "@/lib/business-rules";
import { computeOrderProfit } from "@/lib/order-profit";
import { hydrateMeasurements, compactMeasurements, type MeasureLang } from "@/lib/measurements";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Order, OrderType, Employee, Customer } from "@/lib/types";
import { MeasurementGrid } from "@/components/measurements/measurement-grid";
import { MediaCapture } from "@/components/orders/media-capture";
import { Button } from "@/components/ui/button";
import { FormActionBar } from "@/components/ui/form-action-bar";
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
  tailor: z.string().optional(),
  // Generated once (below) and echoed back unchanged on every edit — lets preserve_garment_payables
  // reattach a frozen payableAmount to the correct garment even if lines are reordered/deleted.
  lineId: z.string().optional(),
  // Echoed back unchanged on edit so it isn't lost — the server ignores/re-derives this value
  // regardless (see preserve_garment_payables), so it's never actually trusted from here.
  payableAmount: z.number().optional(),
});

function newLineId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const expenseSchema = z.object({
  category: z.string().min(1, "Select a category"),
  qty: z.number().min(0).optional(),
  unit: z.string().optional(),
  rate: z.number().min(0).optional(),
  amount: z.number().min(0),
});

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  mobile: z.string().min(10, "Enter a valid 10-digit mobile number"),
  inDate: z.string().min(1),
  inTime: z.string(),
  deliveryDate: z.string().min(1, "Delivery date is required"),
  deliveryTime: z.string(),
  tailor: z.string(),
  special: z.string(),
  advance: z.number().min(0),
  paymentMethod: z.string(),
  garments: z.array(garmentSchema).min(1, "Add at least one garment"),
  bookingSource: z.string().optional(),
  fabricCost: z.number().min(0).optional(),
  otherCost: z.number().min(0).optional(),
  expenses: z.array(expenseSchema).optional(),
});

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer"];

type FormValues = z.infer<typeof formSchema>;
type RateCard = Record<string, Record<Lining, number>>;

const LININGS = Object.keys(LINING_LABELS) as Lining[];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "HH:mm" in local time — the current wall-clock moment an order is being received. */
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
  const { data: tailorRates, isLoading: tailorRatesLoading } = useAppSetting<TailorRateCard>("tailorRates", DEFAULT_TAILOR_RATES);
  const { data: expenseCategories, isLoading: categoriesLoading } = useAppSetting<string[]>("stitchingExpenseCategories", DEFAULT_EXPENSE_CATEGORIES);
  const { data: tailors, isLoading: tailorsLoading } = useActiveTailors();
  const { data: measureFields, isLoading: fieldsLoading } = useMeasureFields();
  const { data: existingExpenses, isLoading: expensesLoading } = useOrderExpensesFor(existingOrder?.id);

  if (ratesLoading || tailorRatesLoading || categoriesLoading || tailorsLoading || fieldsLoading || expensesLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <OrderFormFields
      existingOrder={existingOrder}
      prefillMobile={prefillMobile}
      initialOrderType={initialOrderType}
      rates={rates || DEFAULT_RATES}
      tailorRates={tailorRates || DEFAULT_TAILOR_RATES}
      expenseCategories={expenseCategories || DEFAULT_EXPENSE_CATEGORIES}
      tailors={tailors || []}
      measureFields={measureFields || []}
      existingExpenses={existingExpenses}
    />
  );
}

function OrderFormFields({
  existingOrder,
  prefillMobile,
  initialOrderType,
  rates,
  tailorRates,
  expenseCategories,
  tailors,
  measureFields,
  existingExpenses,
}: {
  existingOrder?: Order;
  prefillMobile?: string;
  initialOrderType?: OrderType;
  rates: RateCard;
  tailorRates: TailorRateCard;
  expenseCategories: string[];
  tailors: Employee[];
  measureFields: string[];
  existingExpenses: { category: string; qty: number | null; unit: string | null; rate: number | null; amount: number }[];
}) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: loyaltyCfg } = useLoyaltyConfig();
  const { data: customers } = useCustomers();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const isEdit = !!existingOrder;

  const garmentTypes = Object.keys(rates);
  const defaultGarmentType = garmentTypes[0] || "";
  const defaultTailor = tailors[0]?.id || "";
  const tailorName = (id: string) => tailors.find((t) => t.id === id)?.name || id;

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
  const [couponCode, setCouponCode] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(!isAlteration);
  const [pickerOpen, setPickerOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existingOrder
      ? {
          name: existingOrder.name,
          mobile: existingOrder.mobile,
          inDate: existingOrder.inDate || todayISO(),
          inTime: existingOrder.inTime,
          deliveryDate: existingOrder.deliveryDate,
          deliveryTime: existingOrder.deliveryTime,
          tailor: existingOrder.tailor,
          special: existingOrder.special,
          advance: existingOrder.advance,
          paymentMethod: "Cash",
          garments:
            existingOrder.garments.length > 0
              ? existingOrder.garments.map((g) => ({
                  type: g.type,
                  lining: g.lining || "s",
                  no: g.no || 1,
                  amount: g.amount || 0,
                  tailor: g.tailor || "",
                  // Backfilled here for any garment that predates lineId — persisted on next
                  // save, self-healing old orders one edit at a time.
                  lineId: g.lineId || newLineId(),
                  payableAmount: g.payableAmount,
                }))
              : // Legacy order with no garment lines at all. The seeded line MUST carry the
                // order's stored total, not a rate-card default — the form derives `total`
                // from these lines, so a default-priced line silently rewrites (usually
                // collapses) the order value, and the server then rejects the whole edit with
                // "Advance cannot exceed total", making such orders permanently uneditable.
                [{ type: defaultGarmentType, lining: "s", no: 1, amount: existingOrder.total || 0, tailor: "", lineId: newLineId() }],
          bookingSource: existingOrder.bookingSource || "",
          fabricCost: existingOrder.fabricCost || 0,
          otherCost: existingOrder.otherCost || 0,
          expenses: existingExpenses.map((e) => ({ category: e.category, qty: e.qty ?? undefined, unit: e.unit ?? undefined, rate: e.rate ?? undefined, amount: e.amount })),
        }
      : {
          name: "",
          mobile: prefillMobile ?? "",
          inDate: todayISO(),
          inTime: nowHHMM(),
          deliveryDate: "",
          // Delivery time starts out matching order-received time — the tailor can change
          // it once a delivery date/time is actually agreed with the customer.
          deliveryTime: nowHHMM(),
          tailor: defaultTailor,
          special: "",
          advance: 0,
          paymentMethod: "Cash",
          garments: [{ type: defaultGarmentType, lining: "s", no: 1, amount: rates[defaultGarmentType]?.s || 0, tailor: defaultTailor, lineId: newLineId() }],
          bookingSource: "",
          fabricCost: 0,
          otherCost: 0,
          expenses: [],
        },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "garments" });
  // True whenever this order loaded with zero real garment lines — the one seeded above
  // (existingOrder.total as its amount) looks identical to a real line otherwise, so a user who
  // adds genuine garment details alongside it without noticing/deleting it would silently
  // double the order's total. Fixed at load time, not re-derived from live field state, so the
  // caution stays visible for the whole edit session rather than disappearing the instant they
  // touch anything.
  const isSeededPlaceholderOrder = isEdit && existingOrder!.garments.length === 0;
  const { fields: expenseFields, append: appendExpense, remove: removeExpense } = useFieldArray({ control, name: "expenses" });
  const garments = useWatch({ control, name: "garments" });
  const expenses = useWatch({ control, name: "expenses" }) || [];
  const advance = useWatch({ control, name: "advance" }) || 0;
  const mobile = useWatch({ control, name: "mobile" });
  const name = useWatch({ control, name: "name" });
  const selectedTailor = useWatch({ control, name: "tailor" });
  const fabricCost = useWatch({ control, name: "fabricCost" }) || 0;
  const otherCost = useWatch({ control, name: "otherCost" }) || 0;
  const total = garments.reduce((s, g) => s + (g.amount || 0) * (g.no || 1), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  // Live profit — the exact same computeOrderProfit() used by Order Details, the Stitching
  // Orders list, and the Order Profitability report (see src/lib/order-profit.ts), fed with
  // this form's current in-progress values so it updates as the user types. A new order is
  // always pre-"ready" (tailorCostIsEstimate always true here); an existing order uses its
  // real current status so an already-ready order shows its real, frozen tailor cost.
  const profit = computeOrderProfit(
    {
      total,
      garments: garments as Order["garments"],
      status: existingOrder?.status || "received",
      orderType,
      fabricCost,
      otherCost,
    },
    tailorRates,
    expenses
  );

  // Advisory-only capacity warning — never blocks save. Reuses the same Low/Normal/High/
  // Overloaded bucketing the Tailor Workload report already uses (src/lib/analytics.ts), just
  // surfaced at the point of booking instead of after the fact.
  const { data: allOrders } = useOrders();
  const tailorWorkload = allOrders && selectedTailor ? getTailorWorkload(allOrders).find((w) => w.tailor === selectedTailor) : undefined;
  const showCapacityWarning = !!tailorWorkload && (tailorWorkload.capacity === "High" || tailorWorkload.capacity === "Overloaded") && (!existingOrder || existingOrder.tailor !== selectedTailor);

  // Each garment also carries its OWN tailor field (drives per-garment piece-rate pay and the
  // Daily Tailor Worksheet report) — it's seeded from this order-level "Tailor" dropdown only
  // once, at form-mount time, and previously never followed it again. Changing the order-level
  // tailor afterward silently left every garment still pointing at whichever tailor happened to
  // be first in the list at creation time, with no visible sign anything was wrong — the order
  // itself correctly showed the newly-picked tailor, but every report reading garment.tailor
  // (worksheet, piece-rate pay, tailor payables) kept crediting the stale one instead. Now any
  // garment whose tailor still matches the PREVIOUS order-level value (i.e. hasn't been
  // individually overridden by the per-garment "Tailor" dropdown) follows the order-level change;
  // a garment already reassigned to a different tailor on purpose is left alone.
  const prevSelectedTailorRef = useRef(selectedTailor);
  useEffect(() => {
    const prev = prevSelectedTailorRef.current;
    if (selectedTailor !== prev) {
      garments.forEach((g, i) => {
        if (!g.tailor || g.tailor === prev) setValue(`garments.${i}.tailor`, selectedTailor, { shouldDirty: true });
      });
      prevSelectedTailorRef.current = selectedTailor;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTailor]);

  // Look up an existing customer once the mobile number is complete, so we can offer to
  // reuse their saved measurements and redeem their loyalty points (old app: fillCust()).
  const lookupMobile = !existingOrder && mobile?.length === 10 ? mobile : "";
  const { data: foundCustomer } = useCustomerByMobile(lookupMobile);

  useSyncFromSource(existingOrder || prefilled ? null : foundCustomer, (customer) => {
    if (!customer) return;
    setValue("name", customer.name, { shouldValidate: true });
    const saved = hydrateMeasurements(measureFields, customer.measurements);
    setMeasurements(saved);
    setPrefilled(true);
    toast.success(`Loaded ${customer.name}'s details`);
  });

  // Reset the prefill latch if the number is edited, so a different customer re-triggers it.
  useSyncFromSource(mobile, (m) => {
    if (m?.length !== 10) setPrefilled(false);
  });

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

  function selectCustomer(c: Customer) {
    setValue("mobile", c.mobile, { shouldValidate: true });
    setValue("name", c.name, { shouldValidate: true });
    // The mobile/measurements/loyalty auto-prefill effect below watches `mobile` and fires the
    // moment it's a full 10 digits — picking a customer here just feeds that same effect
    // instead of duplicating its prefill logic.
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
          couponCode: couponCode.trim() || undefined,
        });
        toast.success(res.ptDiscount > 0 ? `Order ${res.order.id} created · ${inr(res.ptDiscount)} points discount applied` : `Order ${res.order.id} created`);
        if (res.limitWarning) toast.warning(res.limitWarning);
        if (res.paymentLedgerWarning) toast.warning(res.paymentLedgerWarning, { duration: 12_000 });
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
                <div className="flex gap-2">
                  <SearchSelect
                    className="flex-1"
                    inputClassName="h-10"
                    placeholder="Type a name or mobile number…"
                    value={mobile ? customers?.find((c) => c.mobile === mobile)?.id || "" : ""}
                    fallbackLabel={name || undefined}
                    options={(customers || []).map((c) => ({ value: c.id, label: c.name, sublabel: c.mobile }))}
                    onSelect={(id) => {
                      const c = (customers || []).find((c) => c.id === id);
                      if (c) selectCustomer(c);
                    }}
                  />
                  {!isEdit && (
                    <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => setPickerOpen(true)}>
                      New
                    </Button>
                  )}
                </div>
              </FieldGroup>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Mobile" required error={errors.mobile?.message}>
                <Input {...register("mobile")} maxLength={10} inputMode="numeric" placeholder="10-digit number" autoComplete="tel" className="h-10" />
              </FieldGroup>
              <FieldGroup label="Name" required error={errors.name?.message}>
                <Input {...register("name")} placeholder="Customer name" autoComplete="name" className="h-10" />
              </FieldGroup>
              <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                <FieldGroup label="Order date" required>
                  <Controller control={control} name="inDate" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />} />
                </FieldGroup>
                <FieldGroup label="Order time" hint="When the order was received">
                  <Input type="time" {...register("inTime")} className="h-10" />
                </FieldGroup>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                <FieldGroup label="Delivery date" required error={errors.deliveryDate?.message}>
                  <Controller control={control} name="deliveryDate" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} placeholder="Pick delivery date" />} />
                </FieldGroup>
                <FieldGroup label="Delivery time" hint="Countdown uses this if set">
                  <Input type="time" {...register("deliveryTime")} className="h-10" />
                </FieldGroup>
              </div>
              <FieldGroup label="Tailor" className="sm:col-span-2">
                {tailors.length > 0 ? (
                  <Controller
                    control={control}
                    name="tailor"
                    render={({ field: f }) => (
                      <Select value={f.value} onValueChange={(v) => v && f.onChange(v)}>
                        <SelectTrigger className="h-10 w-full">
                          {/* Base UI renders the raw stored value (a UUID) unless given a formatter — same fix as Lining above. */}
                          <SelectValue>{(v: string) => tailors.find((t) => t.id === v)?.name || "Assign a tailor"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {tailors.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                ) : (
                  // No free-text fallback — whatever's typed here would be saved as an id and
                  // could never match any employee, permanently orphaning the order's tailor
                  // attribution. Add the employee first instead.
                  <Input disabled placeholder="Add a tailor under Employees first" className="h-10" />
                )}
              </FieldGroup>
              {showCapacityWarning && tailorWorkload && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50 p-2.5 text-xs text-amber-800 sm:col-span-2 dark:bg-amber-950/40 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <span className="font-medium">{tailorName(selectedTailor)}</span> has {tailorWorkload.active} active order{tailorWorkload.active === 1 ? "" : "s"} —{" "}
                    <span className="font-medium">{tailorWorkload.capacity}</span> load. Consider another tailor or a later delivery date.
                  </span>
                </div>
              )}
              <FieldGroup label="How did they find us?" hint="Optional — helps track which channels bring in orders." className="sm:col-span-2">
                <Controller
                  control={control}
                  name="bookingSource"
                  render={({ field: f }) => (
                    <Select value={f.value || ""} onValueChange={(v) => f.onChange(v || "")}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="Not recorded" />
                      </SelectTrigger>
                      <SelectContent>
                        {BOOKING_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
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
            {isSeededPlaceholderOrder && (
              <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                ⚠️ This order had no garment line details saved, so the line below stands in for its total (₹{(existingOrder!.total || 0).toLocaleString("en-IN")}) so nothing changes by
                accident. If you&apos;re adding the real garment(s), either edit this line to match them or delete it first — leaving it in place alongside new lines will double-count
                the order&apos;s value.
              </p>
            )}
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="rounded-lg border p-3">
                  <div className="grid gap-3 sm:grid-cols-12">
                    <FieldGroup label="Type" className="sm:col-span-3">
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
                    <FieldGroup label="Lining" className="sm:col-span-2">
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
                    <FieldGroup label="Tailor" className="sm:col-span-3" hint={tailors.length === 0 ? "Add tailors in Employees" : undefined}>
                      <Controller
                        control={control}
                        name={`garments.${index}.tailor`}
                        render={({ field: f }) => (
                          <Select value={f.value || ""} onValueChange={(v) => f.onChange(v || "")}>
                            <SelectTrigger className="h-10 w-full">
                              {/* Same Base-UI raw-value fallback issue as the order-level Tailor field above. */}
                              <SelectValue>{(v: string) => tailors.find((t) => t.id === v)?.name || "Unassigned"}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {tailors.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FieldGroup>
                    <FieldGroup label="Qty" className="sm:col-span-1">
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
                onClick={() => append({ type: defaultGarmentType, lining: "s", no: 1, amount: rates[defaultGarmentType]?.s || 0, tailor: selectedTailor || "", lineId: newLineId() })}
              >
                <Plus className="size-4" /> Add garment
              </Button>
              {errors.garments && <p className="text-xs text-destructive">{errors.garments.message as string}</p>}
            </div>
          </div>

          {user?.perms.viewReports && (
            <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
              <SectionHeading icon={Receipt} label="Costs (internal — not shown to customer)" />
              <p className="-mt-2 mb-4 text-xs text-muted-foreground">Powers the order-profitability report. Leave blank if unknown.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldGroup label="Fabric cost">
                  <Controller
                    control={control}
                    name="fabricCost"
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
                <FieldGroup label="Other cost" hint="Trims, lining fabric, outsourced work, etc.">
                  <Controller
                    control={control}
                    name="otherCost"
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
              </div>

              <div className="mt-5 border-t pt-4">
                <SectionHeading icon={Wallet} label="Stitching expenses" />
                <div className="space-y-3">
                  {expenseFields.map((field, index) => (
                    <div key={field.id} className="rounded-lg border p-3">
                      <div className="grid gap-3 sm:grid-cols-12">
                        <FieldGroup label="Category" className="sm:col-span-3">
                          <Controller
                            control={control}
                            name={`expenses.${index}.category`}
                            render={({ field: f }) => (
                              <Select value={f.value} onValueChange={(v) => v && f.onChange(v)}>
                                <SelectTrigger className="h-10 w-full">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  {expenseCategories.map((c) => (
                                    <SelectItem key={c} value={c}>
                                      {c}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </FieldGroup>
                        <FieldGroup label="Qty" className="sm:col-span-2" hint="Optional">
                          <Controller
                            control={control}
                            name={`expenses.${index}.qty`}
                            render={({ field: f }) => (
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                inputMode="decimal"
                                className="h-10"
                                value={f.value ?? ""}
                                onChange={(e) => {
                                  const qty = e.target.value === "" ? undefined : Number(e.target.value);
                                  f.onChange(qty);
                                  const rate = expenses[index]?.rate;
                                  if (qty != null && rate != null) setValue(`expenses.${index}.amount`, Math.round(qty * rate * 100) / 100);
                                }}
                                onBlur={f.onBlur}
                              />
                            )}
                          />
                        </FieldGroup>
                        <FieldGroup label="Unit" className="sm:col-span-2" hint="e.g. Meter">
                          <Input placeholder="—" className="h-10" {...register(`expenses.${index}.unit`)} />
                        </FieldGroup>
                        <FieldGroup label="Rate" className="sm:col-span-2" hint="Optional">
                          <Controller
                            control={control}
                            name={`expenses.${index}.rate`}
                            render={({ field: f }) => (
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                inputMode="decimal"
                                className="h-10"
                                value={f.value ?? ""}
                                onChange={(e) => {
                                  const rate = e.target.value === "" ? undefined : Number(e.target.value);
                                  f.onChange(rate);
                                  const qty = expenses[index]?.qty;
                                  if (qty != null && rate != null) setValue(`expenses.${index}.amount`, Math.round(qty * rate * 100) / 100);
                                }}
                                onBlur={f.onBlur}
                              />
                            )}
                          />
                        </FieldGroup>
                        <FieldGroup label="Amount" className="sm:col-span-2">
                          <Controller
                            control={control}
                            name={`expenses.${index}.amount`}
                            render={({ field: f }) => (
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                inputMode="decimal"
                                className="h-10"
                                value={f.value ? String(f.value) : ""}
                                onChange={(e) => f.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                                onBlur={f.onBlur}
                              />
                            )}
                          />
                        </FieldGroup>
                        <div className="flex items-end sm:col-span-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-9 sm:size-8"
                            aria-label={`Remove expense ${index + 1}`}
                            onClick={() => removeExpense(index)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => appendExpense({ category: expenseCategories[0] || "", amount: 0 })}
                  >
                    <Plus className="size-4" /> Add expense
                  </Button>

                  {expenseFields.length > 0 && (
                    <p className="text-right text-sm">
                      <span className="text-muted-foreground">Total stitching expenses </span>
                      <span className="font-semibold tabular-nums">{inr(totalExpenses)}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-1.5 border-t pt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Order value</span>
                  <span className="tabular-nums">{inr(profit.revenue)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tailor cost{profit.tailorCostIsEstimate ? " (estimated)" : ""}</span>
                  <span className="tabular-nums">−{inr(profit.tailorCost)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Stitching expenses</span>
                  <span className="tabular-nums">−{inr(profit.stitchingExpenses)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Fabric + other cost</span>
                  <span className="tabular-nums">−{inr(profit.fabricCost + profit.otherCost)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
                  <span className="flex items-center gap-1.5">
                    {profit.profit >= 0 ? <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" /> : <TrendingDown className="size-4 text-red-600 dark:text-red-400" />}
                    {profit.tailorCostIsEstimate ? "Estimated profit margin" : "Profit margin"}
                  </span>
                  <span className={cn("tabular-nums", profit.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {inr(profit.profit)}
                    {profit.marginPct != null && <span className="ml-1 text-xs font-normal text-muted-foreground">({profit.marginPct}%)</span>}
                  </span>
                </div>
              </div>
            </div>
          )}

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

              {!isEdit && (
                <FieldGroup label="Referral coupon code" hint={`Applies ₹${REFERRAL_COUPON_DISCOUNT} off if valid — checked when you create the order.`}>
                  <Input
                    placeholder="e.g. REF-AB12CD"
                    className="h-10 uppercase"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  />
                </FieldGroup>
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

      <FormActionBar>
        <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button size="sm" className="bg-primary text-primary-foreground gap-1.5" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
          <ClipboardList className="size-3.5" />
          {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : `Create Order · ${inr(total)}`}
        </Button>
      </FormActionBar>

      {!isEdit && <CustomerPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={selectCustomer} />}
    </div>
  );
}
