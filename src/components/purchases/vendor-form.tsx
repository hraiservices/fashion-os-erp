"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Building2, MapPin, FileText, Save } from "lucide-react";
import Link from "next/link";
import { useSaveVendor } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Vendor } from "@/lib/types";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  mobile: z.string().optional(),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  gstin: z.string().optional(),
  state: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

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

export function VendorForm({ existing }: { existing?: Vendor }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const saveVendor = useSaveVendor();
  const isEdit = !!existing;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: existing
      ? { name: existing.name, mobile: existing.mobile, email: existing.email, gstin: existing.gstin, state: existing.state, address: existing.address, notes: existing.notes }
      : { name: "", mobile: "", email: "", gstin: "", state: "", address: "", notes: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      const res = await saveVendor.mutateAsync({
        id: existing?.id,
        name: values.name,
        mobile: values.mobile || "",
        email: values.email || "",
        gstin: values.gstin || "",
        state: values.state || "",
        address: values.address || "",
        notes: values.notes || "",
        userEmail: user?.email,
      });
      toast.success(isEdit ? "Vendor updated" : "Vendor added");
      router.push(isEdit ? `/purchases/vendors/${existing!.id}` : `/purchases/vendors/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save vendor");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit as never)} className="min-h-screen bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b bg-white dark:bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/purchases/vendors" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Vendors</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold">{isEdit ? "Edit Vendor" : "New Vendor"}</h1>
            {isEdit && <p className="text-[11px] font-mono text-muted-foreground">{existing!.name}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" size="sm" className="gap-1.5" disabled={isSubmitting}>
              <Save className="size-3.5" />
              {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Vendor"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-5">
        {/* Vendor details */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={Building2} label="Vendor details" />
          <div className="space-y-4">
            <FieldGroup label="Business / vendor name" required error={errors.name?.message}>
              <Input placeholder="e.g. Anand Fabrics" className="h-10" {...register("name")} />
            </FieldGroup>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="Mobile">
                <Input type="tel" placeholder="10-digit" className="h-10" {...register("mobile")} />
              </FieldGroup>
              <FieldGroup label="Email" error={errors.email?.message}>
                <Input type="email" placeholder="vendor@example.com" className="h-10" {...register("email")} />
              </FieldGroup>
            </div>
          </div>
        </div>

        {/* Tax & address */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={MapPin} label="Tax & address" />
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup label="GSTIN">
                <Input placeholder="22AAAAA0000A1Z5" className="h-10" {...register("gstin")} />
              </FieldGroup>
              <FieldGroup label="State">
                <Input placeholder="e.g. Maharashtra" className="h-10" {...register("state")} />
              </FieldGroup>
            </div>
            <FieldGroup label="Address">
              <Textarea placeholder="Street, city, pincode…" rows={2} className="resize-none" {...register("address")} />
            </FieldGroup>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-xl border bg-white dark:bg-card shadow-sm p-5">
          <SectionHeading icon={FileText} label="Notes" />
          <FieldGroup label="Internal notes" hint="Not shared with the vendor.">
            <Textarea placeholder="Payment habits, quality notes, contact preferences…" rows={3} className="resize-none" {...register("notes")} />
          </FieldGroup>
        </div>
      </div>
    </form>
  );
}
