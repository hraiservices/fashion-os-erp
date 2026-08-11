"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useSaveEmployee } from "@/hooks/use-employee-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Employee, CommissionType, SalaryType } from "@/lib/types";
import { SALARY_TYPE_LABELS } from "@/lib/payroll";

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
});
type FormValues = z.infer<typeof schema>;

const commissionLabel = (v: unknown) => COMMISSION_LABELS[v as CommissionType] ?? "";
const salaryLabel = (v: unknown) => SALARY_TYPE_LABELS[v as SalaryType] ?? "";

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function EmployeeForm({ existing }: { existing?: Employee }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const saveEmployee = useSaveEmployee();
  const isEdit = !!existing;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
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
        }
      : { name: "", mobile: "", role: "", employmentType: "full_time", commissionType: "none", commissionRate: 0, active: true, joinedDate: "", notes: "", salaryType: "monthly", salaryRate: 0 },
  });

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
        salaryType: values.salaryType,
        salaryRate: values.salaryRate || 0,
        userEmail: user?.email,
      });
      toast.success(isEdit ? "Employee updated" : "Employee added");
      router.push(isEdit ? `/employees/${existing!.id}` : `/employees/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save employee");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{isEdit ? `Edit employee · ${existing!.name}` : "New employee"}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit as never)}>
        <CardContent className="space-y-5">
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name *" error={errors.name?.message} className="col-span-2">
                <Input placeholder="e.g. Ramesh Kumar" {...register("name")} />
              </Field>
              <Field label="Mobile">
                <Input type="tel" placeholder="10-digit" {...register("mobile")} />
              </Field>
              <Field label="Role">
                <Input placeholder="e.g. Tailor, Salesperson, Cutter" {...register("role")} />
              </Field>
              <Field label="Employment type">
                <Controller
                  control={control}
                  name="employmentType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                      <SelectTrigger className="w-full">
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
              </Field>
              <Field label="Joined">
                <Input type="date" {...register("joinedDate")} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Commission</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Controller
                  control={control}
                  name="commissionType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue>{commissionLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(COMMISSION_LABELS) as CommissionType[]).map((c) => (
                          <SelectItem key={c} value={c}>
                            {COMMISSION_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Rate">
                <Controller
                  control={control}
                  name="commissionRate"
                  render={({ field }) => <NumberInput min={0} step={0.01} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
                />
              </Field>
            </div>
          </section>

          {user?.perms.managePayroll && (
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Salary</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pay basis">
                  <Controller
                    control={control}
                    name="salaryType"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue>{salaryLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(SALARY_TYPE_LABELS) as SalaryType[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {SALARY_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field label="Rate (₹)">
                  <Controller
                    control={control}
                    name="salaryRate"
                    render={({ field }) => <NumberInput min={0} step={0.01} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
                  />
                </Field>
              </div>
            </section>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" id="active" className="size-4" {...register("active")} />
            <Label htmlFor="active" className="text-xs font-medium">
              Active (shows in the Tailor dropdown and daily attendance register)
            </Label>
          </div>

          <Field label="Notes">
            <Textarea placeholder="Optional notes…" rows={2} {...register("notes")} />
          </Field>
        </CardContent>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
