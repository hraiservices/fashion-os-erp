"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useSaveVendor } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
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
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{isEdit ? `Edit vendor · ${existing!.name}` : "New vendor"}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit as never)}>
        <CardContent className="space-y-5">
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name *" error={errors.name?.message} className="col-span-2">
                <Input placeholder="e.g. Anand Fabrics" {...register("name")} />
              </Field>
              <Field label="Mobile">
                <Input type="tel" placeholder="10-digit" {...register("mobile")} />
              </Field>
              <Field label="Email" error={errors.email?.message}>
                <Input type="email" placeholder="vendor@example.com" {...register("email")} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tax & address</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="GSTIN">
                <Input placeholder="22AAAAA0000A1Z5" {...register("gstin")} />
              </Field>
              <Field label="State">
                <Input placeholder="e.g. Maharashtra" {...register("state")} />
              </Field>
            </div>
            <Field label="Address">
              <Textarea placeholder="Street, city, pincode…" rows={2} {...register("address")} />
            </Field>
          </section>

          <Field label="Notes">
            <Textarea placeholder="Optional notes…" rows={2} {...register("notes")} />
          </Field>
        </CardContent>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add vendor"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
