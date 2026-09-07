"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, User2, Shirt, Wallet, Ruler, Gift, Check, ClipboardList, AlertTriangle, Receipt, TrendingUp, TrendingDown, Sparkles, ScanLine } from "lucide-react";
import { useCreateOrder, useUpdateOrder } from "@/hooks/use-order-mutations";
import { useOrders } from "@/hooks/use-orders";
import { useOrderExpensesFor } from "@/hooks/use-order-expenses";
import { CustomerPicker } from "@/components/sales/customer-picker";
import { SearchSelect } from "@/components/ui/search-select";
import { useCustomers } from "@/hooks/use-customers";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { Checkbox } from "@/components/ui/checkbox";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useActiveTailors } from "@/hooks/use-employees";
import { useMeasureFields } from "@/hooks/use-measure-fields";
import { useCustomerByMobile } from "@/hooks/use-customer";
import { useLoyaltyConfig } from "@/hooks/use-loyalty-config";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { getTailorWorkload, estimateDeliveryDate, estimateReworkRisk, rankTailorsForOrder } from "@/lib/analytics";
import { DEFAULT_FABRIC_USAGE, estimateFabricRequirement } from "@/lib/fabric-usage";
import {
  DEFAULT_RATES,
  DEFAULT_TAILOR_RATES,
  DEFAULT_EXPENSE_CATEGORIES,
  LINING_LABELS,
  BOOKING_SOURCES,
  REFERRAL_COUPON_DISCOUNT,
  computeRedemption,
  loyaltyTier,
  isValidManualOrderNumber,
  type Lining,
  type TailorRateCard,
} from "@/lib/business-rules";
import { computeOrderProfit } from "@/lib/order-profit";
import { apportionAmount } from "@/lib/order-split";
import { hydrateMeasurements, compactMeasurements, type MeasureLang } from "@/lib/measurements";
import { inr, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Order, OrderType, Employee, Customer } from "@/lib/types";
import { MeasurementGrid } from "@/components/measurements/measurement-grid";
import { useExtractMeasurements } from "@/hooks/use-measurement-extraction";
import { useTranscribeVoiceNote } from "@/hooks/use-transcribe-voice-note";
import { fileToDataUrl } from "@/lib/image-utils";
import { MediaCapture } from "@/components/orders/media-capture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDue } from "@/components/ui/money-text";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { istDateString } from "@/lib/ist-date";
import { getProfiles, activeProfiles, defaultProfile, findProfile } from "@/lib/measurement-profiles";

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
  // Only ever sent/used on create (see the isEdit guard around its field) — an existing order's
  // number is changed through the dedicated rename action instead, not a routine form save.
  orderNumber: z
    .string()
    .optional()
    .refine((v) => !v || isValidManualOrderNumber(v.trim()), "Only letters, numbers, dots, dashes and underscores (no spaces or slashes)"),
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
  // istDateString, NOT toISOString: toISOString() is always UTC regardless of device timezone,
  // so between 00:00 and 05:30 IST (a device correctly set to IST included) it silently returns
  // YESTERDAY's date — a new order's default "Order date" landed a day (and, at a month
  // boundary, a whole month) behind reality, which is exactly what fed the dashboard's monthly
  // charts the wrong bucket even after that bucketing math itself was fixed to use IST.
  return istDateString();
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
  const extractMeasurements = useExtractMeasurements();

  // Which of the customer's saved measurement profiles (if any) is currently loaded — carried
  // through to the save payload so the server can snapshot it onto the order and, when a name
  // is set, upsert it back into the customer's profile array. See lib/measurement-profiles.ts.
  const [measureProfileId, setMeasureProfileId] = useState<string | null>(existingOrder?.measurementProfileId ?? null);
  const [measureProfileName, setMeasureProfileName] = useState<string>(existingOrder?.measurementProfileName ?? "");
  // Whether to persist the measurements typed here back onto the customer at all — off for a
  // genuine one-off order, on otherwise (matches the legacy always-sync behavior by default).
  const [saveMeasurementsToCustomer, setSaveMeasurementsToCustomer] = useState(true);

  async function handleScanChart(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      // Bigger and higher-quality than the logo/favicon uploads elsewhere — this needs to stay
      // legible enough for Gemini to read handwritten numbers off it.
      const imageDataUrl = await fileToDataUrl(file, 1600);
      const values = await extractMeasurements.mutateAsync({ imageDataUrl, fields: measureFields });
      const foundCount = Object.keys(values).length;
      if (foundCount === 0) {
        toast.error("Couldn't read any measurements off that photo — try a clearer/closer shot.");
        return;
      }
      setMeasurements((m) => ({ ...m, ...values }));
      const missed = Math.max(0, measureFields.length - foundCount);
      toast.success(`Filled ${foundCount} field${foundCount === 1 ? "" : "s"} from the photo${missed > 0 ? ` — review the rest manually` : ""}. Double-check before saving.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read the chart");
    }
  }
  const [images, setImages] = useState<string[]>(existingOrder?.images || []);
  const [audios, setAudios] = useState<string[]>(existingOrder?.audios || []);
  const [videos, setVideos] = useState<string[]>(existingOrder?.videos || []);
  const transcribeVoiceNote = useTranscribeVoiceNote();
  const [transcribingIndex, setTranscribingIndex] = useState<number | null>(null);

  async function handleTranscribe(audioDataUrl: string, index: number) {
    setTranscribingIndex(index);
    try {
      const text = await transcribeVoiceNote.mutateAsync(audioDataUrl);
      if (text === "(could not transcribe)") {
        toast.error("Couldn't make out that recording — try re-recording somewhere quieter.");
        return;
      }
      const current = getValues("special");
      setValue("special", current ? `${current}\n🎤 ${text}` : text, { shouldDirty: true });
      toast.success("Added to Special Instructions — review before saving.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't transcribe that recording");
    } finally {
      setTranscribingIndex(null);
    }
  }
  const [usePoints, setUsePoints] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  // New orders only (splitting an already-created order isn't supported) — on by default per
  // the agreed design, so a multi-garment order is one board card per garment unless someone
  // deliberately turns it off. A no-op for the common single-garment order regardless of this
  // setting (see totalPieceCount below), so it never changes anything for the typical case.
  const [splitOrders, setSplitOrders] = useState(true);
  const [prefilled, setPrefilled] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [costsOpen, setCostsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
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

  // AI-adjacent smart suggestion (not an LLM call — a fast deterministic estimate so it can
  // recompute live on every keystroke): the tailor's own historical turnaround if they have
  // enough completed orders to trust, else the shop-wide average for these garment types,
  // plus a queue-depth buffer and a day per garment beyond the first. Purely advisory — a chip
  // next to the field, never auto-applied over whatever the user actually picks.
  const inDate = useWatch({ control, name: "inDate" });
  const deliveryDate = useWatch({ control, name: "deliveryDate" });
  const deliveryEstimate =
    allOrders && selectedTailor && inDate && garments.length > 0
      ? estimateDeliveryDate(
          allOrders,
          selectedTailor,
          garments.map((g) => g.type),
          inDate
        )
      : undefined;
  const showDeliverySuggestion = !!deliveryEstimate && deliveryEstimate.date !== deliveryDate;

  // Same spirit, applied to rework risk instead of a date: a fast deterministic estimate over
  // this tailor's (and garment type's) own history of flagged rework / overdue orders — not an
  // LLM call, so it can recompute live as tailor/garments change. Advisory only, never blocks
  // saving the order.
  const reworkRisk =
    allOrders && selectedTailor && garments.length > 0 ? estimateReworkRisk(allOrders, selectedTailor, garments.map((g) => g.type)) : null;
  const showReworkRisk = !!reworkRisk && (reworkRisk.level === "medium" || reworkRisk.level === "high");

  // "Best tailor" recommendation — same combine-existing-signals idea as the rework-risk flag,
  // just ranking every tailor instead of scoring the one already picked. Only worth surfacing
  // before a tailor is chosen (or a brand-new order still on the auto-picked default) — once
  // someone has deliberately picked a tailor themselves, second-guessing that on every garment
  // edit would be noise, not help.
  const recommendedTailor =
    allOrders && tailors.length > 1 && garments.length > 0 && (!isEdit || !existingOrder?.tailor)
      ? rankTailorsForOrder(allOrders, tailors.map((t) => t.id), garments.map((g) => g.type))[0]
      : undefined;
  const showTailorRecommendation = !!recommendedTailor && recommendedTailor.tailorId !== selectedTailor;

  // Fabric requirement estimate — a configurable reference table (Settings → Rate Card), not
  // learned from past orders like the estimators above: stitching orders never record a
  // meters-consumed figure to learn from, only a ₹ fabricCost. See lib/fabric-usage.ts.
  const { data: fabricUsage } = useAppSetting<Record<string, number>>("fabricUsage", DEFAULT_FABRIC_USAGE);
  const fabricEstimate = estimateFabricRequirement(garments, fabricUsage || DEFAULT_FABRIC_USAGE);

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

  // Also looked up on edit (and kept live as the mobile field changes) purely to read the
  // customer's saved measurement profiles for the Load/Save controls below — never used to
  // auto-prefill name/measurements outside the new-order flow above.
  const profileLookupMobile = mobile?.length === 10 ? mobile : "";
  const { data: profileCustomer } = useCustomerByMobile(profileLookupMobile);
  const measureProfiles = profileCustomer
    ? activeProfiles(getProfiles({ measurements: profileCustomer.measurements, measurementProfiles: profileCustomer.measurementProfiles, createdAt: profileCustomer.createdAt }))
    : [];

  useSyncFromSource(existingOrder || prefilled ? null : foundCustomer, (customer) => {
    if (!customer) return;
    setValue("name", customer.name, { shouldValidate: true });
    const profiles = activeProfiles(getProfiles({ measurements: customer.measurements, measurementProfiles: customer.measurementProfiles, createdAt: customer.createdAt }));
    const toLoad = defaultProfile(profiles);
    const saved = toLoad ? hydrateMeasurements(measureFields, toLoad.values) : hydrateMeasurements(measureFields, customer.measurements);
    setMeasurements(saved);
    setMeasureProfileId(toLoad?.id ?? null);
    setMeasureProfileName(toLoad?.name ?? "");
    setPrefilled(true);
    toast.success(`Loaded ${customer.name}'s details`);
  });

  function handlePickProfile(id: string) {
    if (id === "__blank__") {
      setMeasurements(hydrateMeasurements(measureFields, {}));
      setMeasureProfileId(null);
      setMeasureProfileName("");
      return;
    }
    const profile = findProfile(measureProfiles, id);
    if (!profile) return;
    setMeasurements(hydrateMeasurements(measureFields, profile.values));
    setMeasureProfileId(profile.id);
    setMeasureProfileName(profile.name);
  }

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

  const totalPieceCount = garments.reduce((s, g) => s + (g.no || 1), 0);

  /**
   * "Create a separate order for each garment" path — one createOrder call per physical piece
   * (a garment line with no=3 becomes 3 single-piece orders, not 3 lines on one order), all
   * sharing a client-generated group_id so staff can still find them together. Sequential, not
   * parallel: keeps sequential order numbering simple and avoids many concurrent inserts for the
   * same customer racing each other.
   *
   * Money is deliberately NOT linked across the group (per design decision): total/advance are
   * apportioned per piece by that piece's own share of the order's total value, rounded to the
   * nearest rupee with any leftover absorbed into the LAST piece so the sum always reconciles
   * exactly to what was entered. Loyalty-point redemption, the referral coupon, fabric/other
   * cost and stitching expenses are NOT divided — they're one-time, order-level things that
   * don't cleanly map to "per garment", so they're attached to the first order in the group only
   * (never duplicated, never invented from nothing).
   */
  async function submitSplitOrders(values: Omit<FormValues, "paymentMethod">, paymentMethod: string, measurementPayload: Record<string, unknown>) {
    const groupId = newLineId();
    const pieces: { type: string; lining: string; amount: number; tailor?: string }[] = [];
    values.garments.forEach((g) => {
      const qty = g.no || 1;
      for (let i = 0; i < qty; i++) pieces.push({ type: g.type, lining: g.lining, amount: g.amount, tailor: g.tailor });
    });

    const advanceByPiece = apportionAmount(
      values.advance,
      pieces.map((p) => p.amount)
    );
    const created: Order[] = [];

    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      // apportionAmount's own invariant (the pieces sum back to the entered advance exactly) can
      // only be broken by this cap, and only when one garment's price is wildly out of line with
      // the rest of the order — the cap still guarantees no single order's advance ever exceeds
      // its own total, which the server enforces anyway.
      const cappedAdvance = Math.min(advanceByPiece[i], piece.amount);

      try {
        const res = await createOrder.mutateAsync({
          name: values.name,
          mobile: values.mobile,
          inDate: values.inDate,
          inTime: values.inTime,
          deliveryDate: values.deliveryDate,
          deliveryTime: values.deliveryTime,
          tailor: piece.tailor || values.tailor,
          special: values.special,
          advance: cappedAdvance,
          garments: [{ type: piece.type, lining: piece.lining, no: 1, amount: piece.amount, tailor: piece.tailor }],
          total: piece.amount,
          measurements: measurementPayload,
          ...(i === 0 ? measurementProfileFields : { measurementSaveMode: "skip" as const }),
          images, audios, videos,
          usePoints: i === 0 ? usePoints : false,
          orderType,
          paymentMethod: cappedAdvance > 0 ? paymentMethod : undefined,
          bookingSource: values.bookingSource,
          fabricCost: i === 0 ? values.fabricCost : 0,
          otherCost: i === 0 ? values.otherCost : 0,
          couponCode: i === 0 ? couponCode.trim() || undefined : undefined,
          expenses: i === 0 ? values.expenses : undefined,
          groupId,
        });
        created.push(res.order);
      } catch (e) {
        const createdList = created.map((o) => o.id).join(", ");
        throw new Error(
          created.length > 0
            ? `Created ${created.length} of ${pieces.length} orders (${createdList}) before this failed: ${e instanceof Error ? e.message : "Unknown error"}. The customer's remaining garment(s) were NOT ordered — check ${createdList} and add the rest manually if needed.`
            : e instanceof Error
              ? e.message
              : "Failed to save order"
        );
      }
    }
    return created;
  }

  const measurementSaveMode: "profile" | "flat" | "skip" = !saveMeasurementsToCustomer ? "skip" : measureProfileName.trim() ? "profile" : "flat";
  const measurementProfileFields =
    measurementSaveMode === "profile"
      ? { measurementProfileId: measureProfileId ?? undefined, measurementProfileName: measureProfileName.trim(), measurementSaveMode }
      : { measurementSaveMode };

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
            ...measurementProfileFields,
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
      } else if (splitOrders && totalPieceCount > 1) {
        const createdOrders = await submitSplitOrders(values, paymentMethod, measurementPayload);
        toast.success(`Created ${createdOrders.length} orders — one per garment: ${createdOrders.map((o) => o.id).join(", ")}`);
        router.push("/orders");
      } else {
        const res = await createOrder.mutateAsync({
          ...values,
          total,
          measurements: measurementPayload,
          ...measurementProfileFields,
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
        router.push("/orders");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save order", { duration: 15_000 });
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* ── Page header bar ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/orders" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Orders</span>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold truncate">{isEdit ? "Edit Order" : isAlteration ? "New Alteration" : "New Order"}</h1>
            {isEdit && <p className="text-[11px] text-muted-foreground font-mono">{existingOrder.id}</p>}
          </div>
          {/* Duplicate of the summary card's primary action, mobile only — that card sits at
             the end of a single-column stack on mobile, so this keeps Create/Save reachable
             without scrolling all the way down on a long order form. */}
          <div className="flex items-center gap-2 sm:hidden">
            <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button size="sm" className="gap-1.5 bg-primary text-primary-foreground" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
        <div className="lg:col-span-2 space-y-5">
          {!isEdit && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border bg-white dark:bg-card shadow-sm p-4">
              <Checkbox checked={splitOrders} onChange={(e) => setSplitOrders(e.target.checked)} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Create a separate order for each garment</span>
                <span className="block text-xs text-muted-foreground">
                  {totalPieceCount > 1
                    ? `This order has ${totalPieceCount} garments — with this on, you'll get ${totalPieceCount} separate orders (e.g. so a tailor can move one suit to Cutting without the others following). Payment and delivery date are split across them; recommended for most multi-garment orders.`
                    : "Only matters once this order has more than one garment — add another garment line or increase a quantity to see it apply."}
                </span>
              </span>
            </label>
          )}
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
              {!isEdit && (
                <FieldGroup
                  label="Order number"
                  hint="Optional — leave blank to auto-generate. Set this to match an old system's numbering or a specific requirement."
                  error={errors.orderNumber?.message}
                  className="sm:col-span-2"
                >
                  <Input {...register("orderNumber")} placeholder="Leave blank to auto-generate" className="h-10" />
                </FieldGroup>
              )}
              <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                <FieldGroup label="Order date" required>
                  <Controller control={control} name="inDate" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />} />
                </FieldGroup>
                <FieldGroup label="Order time" hint="When the order was received">
                  <Controller control={control} name="inTime" render={({ field }) => <TimePicker value={field.value} onChange={field.onChange} />} />
                </FieldGroup>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                <FieldGroup label="Delivery date" required error={errors.deliveryDate?.message}>
                  <Controller control={control} name="deliveryDate" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} placeholder="Pick delivery date" />} />
                  {showDeliverySuggestion && (
                    <button
                      type="button"
                      onClick={() => setValue("deliveryDate", deliveryEstimate!.date, { shouldDirty: true, shouldValidate: true })}
                      className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-left text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Sparkles className="size-3 shrink-0 text-primary" />
                      Suggested: <span className="font-medium text-foreground">{fmtDate(deliveryEstimate!.date)}</span>
                      <span className="text-muted-foreground">
                        (
                        {deliveryEstimate!.basis === "tailor"
                          ? "this tailor's usual pace"
                          : deliveryEstimate!.basis === "garment-type"
                            ? "typical for these garments"
                            : "default estimate"}
                        {tailorWorkload && (tailorWorkload.capacity === "High" || tailorWorkload.capacity === "Overloaded") ? " + queue" : ""})
                      </span>
                    </button>
                  )}
                </FieldGroup>
                <FieldGroup label="Delivery time" hint="Countdown uses this if set">
                  <Controller control={control} name="deliveryTime" render={({ field }) => <TimePicker value={field.value} onChange={field.onChange} />} />
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
                {showTailorRecommendation && recommendedTailor && (
                  <button
                    type="button"
                    onClick={() => setValue("tailor", recommendedTailor.tailorId, { shouldDirty: true })}
                    className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-left text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Sparkles className="size-3 shrink-0 text-primary" />
                    Recommended: <span className="font-medium text-foreground">{tailorName(recommendedTailor.tailorId)}</span>
                    <span className="text-muted-foreground">
                      ({recommendedTailor.capacity.toLowerCase()} load
                      {recommendedTailor.riskRate !== null ? `, ${recommendedTailor.riskRate}% risk` : ""})
                    </span>
                  </button>
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
              {showReworkRisk && reworkRisk && (
                <div
                  className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs sm:col-span-2 ${
                    reworkRisk.level === "high"
                      ? "border-red-500/30 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
                      : "border-amber-500/30 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  }`}
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <span className="font-medium">{reworkRisk.riskRate}%</span> of{" "}
                    {reworkRisk.basis === "combo" ? "this tailor's past orders for these garments" : "this tailor's past orders"} ({reworkRisk.sampleSize} order
                    {reworkRisk.sampleSize === 1 ? "" : "s"}) needed rework or ran late.{" "}
                    {reworkRisk.level === "high" ? "Consider closer follow-up or an earlier delivery date." : "Worth a closer look."}
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

          {/* Garments */}
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading
              icon={Shirt}
              label="Garments"
              action={
                fabricEstimate && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Sparkles className="size-3 shrink-0 text-primary" />
                    Est. fabric: <span className="font-medium text-foreground">~{fabricEstimate.meters}m</span>
                    {fabricEstimate.missingTypes.length > 0 && " (partial)"}
                  </span>
                )
              }
            />
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
                    <FieldGroup label="Tailor" className="sm:col-span-2" hint={tailors.length === 0 ? "Add tailors in Employees" : undefined}>
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
                onClick={() => append({ type: defaultGarmentType, lining: "s", no: 1, amount: rates[defaultGarmentType]?.s || 0, tailor: selectedTailor || "", lineId: newLineId() })}
              >
                <Plus className="size-4" /> Add garment
              </Button>
              {errors.garments && <p className="text-xs text-destructive">{errors.garments.message as string}</p>}
              <FieldGroup label="Special instructions" className="pt-1">
                <Textarea {...register("special")} rows={2} placeholder="Anything the tailor should know…" />
              </FieldGroup>
            </div>
          </div>

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
                  {measureFields.length > 0 && (
                    <div className="-mt-2 mb-4 flex flex-wrap items-center justify-between gap-2">
                      {/* text-xs text-muted-foreground alone (11px, low-contrast gray) was too
                          subtle to notice as a hint — reported as looking "hidden" even though
                          the color itself was rendering exactly as specified. An icon + stronger
                          color make this actually readable at a glance instead of technically-
                          correct-but-invisible. */}
                      {prefilled ? (
                        <p className="flex items-center gap-1.5 text-sm font-medium text-sky-700 dark:text-sky-400">
                          <Sparkles className="size-3.5 shrink-0" />
                          Loaded from this customer&apos;s saved profile — edit as needed.
                        </p>
                      ) : (
                        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          <Check className="size-3.5 shrink-0" />
                          Saved to the customer for next time.
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={extractMeasurements.isPending}
                        nativeButton={false}
                        render={<label className="cursor-pointer" />}
                      >
                        <ScanLine className="size-3.5" />
                        {extractMeasurements.isPending ? "Reading chart…" : "Scan chart"}
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScanChart} disabled={extractMeasurements.isPending} />
                      </Button>
                    </div>
                  )}
                  {/* Only surfaced once the customer actually has more than one saved profile —
                      per the locked design, a customer with a single (or no) profile keeps
                      seeing exactly the old, simpler single-measurements form. */}
                  {measureProfiles.length >= 2 && (
                    <div className="mb-3">
                      <Label className="mb-1 block text-xs font-medium">Load measurements</Label>
                      <Select value={measureProfileId ?? "__blank__"} onValueChange={(v) => v && handlePickProfile(v)}>
                        <SelectTrigger className="w-full sm:w-72">
                          <SelectValue placeholder="Choose a saved profile…" />
                        </SelectTrigger>
                        <SelectContent>
                          {measureProfiles.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                              {p.isDefault ? " (usual)" : ""}
                            </SelectItem>
                          ))}
                          <SelectItem value="__blank__">+ Start blank</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <MeasurementGrid
                    fields={measureFields}
                    values={measurements}
                    onChange={(key, value) => setMeasurements((m) => ({ ...m, [key]: value }))}
                    lang={measureLang}
                    onLangChange={setMeasureLang}
                  />
                  {measureFields.length > 0 && (
                    <div className="mt-4 space-y-2 border-t pt-3">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={saveMeasurementsToCustomer} onChange={(e) => setSaveMeasurementsToCustomer(e.target.checked)} />
                        Save these measurements to the customer
                      </label>
                      {saveMeasurementsToCustomer && (
                        <FieldGroup label="Profile name (optional — leave blank to just update the customer's default measurements)">
                          <Input
                            value={measureProfileName}
                            onChange={(e) => setMeasureProfileName(e.target.value)}
                            placeholder="e.g. Regular fit, Loose fit, Wedding suit"
                          />
                        </FieldGroup>
                      )}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <MediaCapture
            images={images}
            audios={audios}
            videos={videos}
            onImagesChange={setImages}
            onAudiosChange={setAudios}
            onVideosChange={setVideos}
            onTranscribe={handleTranscribe}
            transcribingIndex={transcribingIndex}
          />

          {user?.perms.viewReports && (
            <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
              <Accordion value={costsOpen ? ["costs"] : []} onValueChange={(v) => setCostsOpen(v.includes("costs"))}>
                <AccordionItem value="costs" className="border-b-0">
                  <AccordionTrigger className="border-b pb-2 mb-4 hover:no-underline">
                    <span className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                        <Receipt className="size-3.5 text-primary" />
                      </span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Costs (internal — not shown to customer)</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
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

              {/* Profit margin is restricted to the admin role specifically — a manager entering
                  fabric/other cost above still needs those fields to do their job, but the
                  derived profit figure itself is admin-only, everywhere in the app. */}
              {user?.role === "admin" && (
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
              )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}
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

              {/* Primary actions live here, right under the running total/balance they commit
                  to — not in a page-wide sticky footer detached from the numbers they submit. */}
              <div className="flex flex-col gap-2 border-t pt-3">
                <Button
                  size="lg"
                  className="h-12 w-full gap-1.5 bg-primary text-base text-primary-foreground"
                  onClick={handleSubmit(onSubmit)}
                  disabled={isSubmitting}
                >
                  <ClipboardList className="size-4" />
                  {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : `Create Order · ${inr(total)}`}
                </Button>
                <Button type="button" variant="outline" size="lg" className="h-11 w-full text-base" onClick={() => router.back()} disabled={isSubmitting}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {!isEdit && <CustomerPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={selectCustomer} startInAddMode />}
    </div>
  );
}
