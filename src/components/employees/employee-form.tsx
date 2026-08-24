"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, User, TrendingUp, Banknote, Save, MapPin } from "lucide-react";
import Link from "next/link";
import { useSaveEmployee } from "@/hooks/use-employee-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useActiveShopLocations } from "@/hooks/use-shop-locations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { EmployeePinManager } from "@/components/employees/employee-pin-manager";
import type { Employee, CommissionType, SalaryType } from "@/lib/types";
import { SALARY_TYPE_LABELS } from "@/lib/payroll";

const NO_LOCATION = "__no_location__";

const COMMISSION_LABELS: Record<CommissionType, string> = {
  none: "No commission",
  percent_of_sales: "% of sales",
  flat_per_order: "Flat amount per order",
};

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  mobile: z.string().optional(),
  role: z.string().optional(),
  employmentType: z.string().optional(),
  commissionType: z.enum(["none", "percent_of_sales", "flat_per_order"]),
  commissionRate: z.number().min(0),
  active: z.boolean(),
  joinedDate: z.string().optional(),
  notes: z.string().optional(),
  salaryType: z.enum(["monthly", "daily", "hourly"]),
  salaryRate: z.number().min(0),
  pieceRateEligible: z.boolean(),
  locationId: z.string(),
});
type FormValues = z.infer<typeof schema>;

const commissionLabel = (v: unknown) => COMMISSION_LABELS[v as CommissionType] ?? "";
const salaryLabel = (v: unknown) => SALARY_TYPE_LABELS[v as SalaryType] ?? "";

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

export function EmployeeForm({ existing }: { existing?: Employee }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: locations } = useActiveShopLocations();
  const saveEmployee = useSaveEmployee();
  const isEdit = !!existing;

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    mode: "onChange",
    defaultValues: existing
      ? {
          name: existing.name,
          mobile: existing.mobile,
          role: existing.role,
          employmentType: existing.employmentType,
          commissionType: existing.commissionType,
          commissionRate: existing.commissionRate,
          active: existing.active,
          joinedDate: existing.joinedDate || "",
          notes: existing.notes,
          salaryType: existing.salaryType,
          salaryRate: existing.salaryRate,
          pieceRateEligible: existing.pieceRateEligible,
          locationId: existing.locationId || NO_LOCATION,
        }
      : {
          name: "",
          mobile: "",
          role: "",
          employmentType: "full_time",
          commissionType: "none",
          commissionRate: 0,
          active: true,
          joinedDate: "",
          notes: "",
          salaryType: "monthly",
          salaryRate: 0,
          pieceRateEligible: false,
          locationId: NO_LOCATION,
        },
  });

  // The Tailor dropdown on Orders is filtered to role.toLowerCase() === "tailor" exactly
  // (useActiveTailorNames) — role is free text so any other wording (Sales Person, Cutter,
  // Manager, ...) never appears there. This mirrors that check so the form doesn't imply
  // every active employee shows up as a tailor.
  const roleValue = watch("role");
  const willShowAsTailor = (roleValue || "").trim().toLowerCase() === "tailor";

  async function onSubmit(values: FormValues) {
    try {
      const res = await saveEmployee.mutateAsync({
        id: existing?.id,
        name: values.name,
        mobile: values.mobile || "",
        role: values.role || "",
        employmentType: values.employmentType || "full_time",
        commissionType: values.commissionType,
        commissionRate: values.commissionRate || 0,
        active: values.active,
        joinedDate: values.joinedDate || null,
        notes: values.notes || "",
        // Only sent when the Salary section is actually visible/editable (gated below on the
        // same permission) — otherwise a manageEmployees-but-not-managePayroll user's save of
        // an unrelated field (e.g. phone number) would silently zero out the real salary,
        // since the hidden section's form state still holds whatever value it loaded with.
        ...(user?.perms.managePayroll
          ? { salaryType: values.salaryType, salaryRate: values.salaryRate || 0, pieceRateEligible: values.pieceRateEligible }
          : {}),
        locationId: values.locationId === NO_LOCATION ? null : values.locationId,
        userEmail: user?.email,
      });
      toast.success(isEdit ? "Employee updated" : "Employee added");
      router.push(isEdit ? `/employees/${existing!.id}` : `/employees/${res.employee.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save employee");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit as never)} className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/employees" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Employees</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Employee" : "New Employee"}</h1>
            {isEdit && <p className="text-[11px] font-mono text-muted-foreground">{existing!.name}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" size="sm" className="gap-1.5" disabled={isSubmitting}>
              <Save className="size-3.5" />
              {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Employee"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-5">
        {/* Basic info */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={User} label="Basic info" />
          <div className="space-y-4">
            <FieldGroup label="Full name" required error={errors.name?.message}>
              <Input placeholder="e.g. Ramesh Kumar" className="h-10" {...register("name")} />
            </FieldGroup>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Mobile">
                <Input type="tel" placeholder="10-digit" className="h-10" {...register("mobile")} />
              </FieldGroup>
              <FieldGroup
                label="Role"
                hint={
                  willShowAsTailor
                    ? "✓ Appears in the Tailor dropdown on Orders (role is exactly \"Tailor\")."
                    : "Only employees whose role is exactly \"Tailor\" appear in the Tailor dropdown on Orders. Other roles (Sales Person, Cutter, Manager, Accountant, …) do not."
                }
              >
                <Input placeholder="e.g. Tailor, Sales Person, Cutter, Manager" className="h-10" {...register("role")} />
              </FieldGroup>
              <FieldGroup label="Employment type">
                <Controller
                  control={control}
                  name="employmentType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_time">Full-time</SelectItem>
                        <SelectItem value="part_time">Part-time</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FieldGroup>
              <FieldGroup label="Joined date">
                <Controller control={control} name="joinedDate" render={({ field }) => <DatePicker value={field.value || ""} onChange={field.onChange} />} />
              </FieldGroup>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" id="active" className="size-4 rounded" {...register("active")} />
              <Label htmlFor="active" className="text-xs font-medium text-foreground/80 cursor-pointer">
                Active — included in the daily attendance register{willShowAsTailor ? " and the Tailor dropdown" : ""}
              </Label>
            </div>
          </div>
        </div>

        {/* Commission */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={TrendingUp} label="Commission" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldGroup label="Commission type">
              <Controller
                control={control}
                name="commissionType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue>{commissionLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(COMMISSION_LABELS) as CommissionType[]).map((c) => (
                        <SelectItem key={c} value={c}>{COMMISSION_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FieldGroup>
            <FieldGroup label="Commission rate" hint="% of sales or flat ₹ per order.">
              <Controller
                control={control}
                name="commissionRate"
                render={({ field }) => <NumberInput min={0} step={0.01} className="h-10" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
              />
            </FieldGroup>
          </div>
        </div>

        {/* Attendance */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={MapPin} label="Attendance" />
          <div className="space-y-4">
            <FieldGroup label="Shop location" hint="Required for self check-in — geofencing checks against this location.">
              <Controller
                control={control}
                name="locationId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue>{(v: unknown) => (v === NO_LOCATION ? "No location assigned" : locations?.find((l) => l.id === v)?.name ?? "")}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_LOCATION}>No location assigned</SelectItem>
                      {(locations || []).map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FieldGroup>
            {isEdit ? (
              <EmployeePinManager employeeId={existing!.id} />
            ) : (
              <p className="text-[11px] text-muted-foreground">Save this employee first, then come back to set their self check-in PIN.</p>
            )}
          </div>
        </div>

        {/* Salary */}
        {user?.perms.managePayroll && (
          <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
            <SectionHeading icon={Banknote} label="Salary" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Pay basis">
                <Controller
                  control={control}
                  name="salaryType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue>{salaryLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(SALARY_TYPE_LABELS) as SalaryType[]).map((t) => (
                          <SelectItem key={t} value={t}>{SALARY_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FieldGroup>
              <FieldGroup label="Rate (₹)" hint="Per month / per day / per hour based on pay basis.">
                <Controller
                  control={control}
                  name="salaryRate"
                  render={({ field }) => <NumberInput min={0} step={0.01} className="h-10" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
                />
              </FieldGroup>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" id="pieceRateEligible" className="size-4 rounded" {...register("pieceRateEligible")} />
              <Label htmlFor="pieceRateEligible" className="text-xs font-medium text-foreground/80 cursor-pointer">
                Piece-rate eligible — also earns per-garment/per-unit pay on top of the salary above, from garments and work orders assigned to them
              </Label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Overtime is a shop-wide flat ₹/hour rate, not set per employee — configure it under{" "}
              <Link href="/settings/attendance-payroll" className="underline hover:text-foreground">Settings → Attendance &amp; Payroll</Link>. It applies automatically to hours worked
              beyond the standard shift, based on this employee&apos;s self check-in/out times.
            </p>
          </div>
        )}

        {/* Notes */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={Banknote} label="Notes" />
          <FieldGroup label="Internal notes">
            <Textarea placeholder="Optional notes…" rows={2} className="resize-none" {...register("notes")} />
          </FieldGroup>
        </div>
      </div>
    </form>
  );
}
