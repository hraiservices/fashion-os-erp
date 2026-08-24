"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { REPORTS_GROUP, resolveReportSection, SETTINGS_GROUP, EMPLOYEES_GROUP } from "@/components/app-shell/nav-config";
import { BUILTIN_WIDGETS } from "@/lib/dashboard-widgets";
import {
  MODULE_CATALOG,
  DEFAULT_ENTITLEMENTS,
  SETTINGS_ALWAYS_ENABLED,
  isModuleEnabled,
  isLicenseExpired,
  reportOwningModule,
  widgetOwningModule,
  type ModuleEntitlements,
  type ModuleId,
} from "@/lib/entitlements";
import { useModuleEntitlements, useSaveModuleEntitlements } from "@/hooks/use-module-entitlements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function CheckRow({ label, description, checked, disabled, onChange }: { label: string; description?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cn("flex items-start gap-2.5 rounded-lg border p-2.5", disabled ? "opacity-40" : "cursor-pointer hover:bg-muted/40")}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
    </label>
  );
}

/** Settings > Module Licensing — platform-owner-only. Decides what exists in THIS deployment at all (separate from src/lib/permissions.ts, which decides what a role can do within a deployment that already has a module). Writes go through the set_module_entitlements RPC, not a plain app_settings upsert. */
export function ModuleLicensingSection() {
  const { data, isLoading } = useModuleEntitlements();
  const save = useSaveModuleEntitlements();
  const [ent, setEnt] = useState<ModuleEntitlements>(DEFAULT_ENTITLEMENTS);

  useEffect(() => {
    if (data) setEnt(data);
  }, [data]);

  function toggleModule(id: ModuleId, v: boolean) {
    setEnt((e) => ({ ...e, modules: { ...e.modules, [id]: v } }));
  }

  function toggleReport(href: string, v: boolean) {
    setEnt((e) => ({ ...e, reports: { ...e.reports, [href]: v } }));
  }

  function toggleWidget(key: string, v: boolean) {
    setEnt((e) => ({ ...e, widgets: { ...e.widgets, [key]: v } }));
  }

  function toggleSetting(href: string, v: boolean) {
    setEnt((e) => ({ ...e, settings: { ...e.settings, [href]: v } }));
  }

  function setPaidUntil(v: string) {
    setEnt((e) => ({ ...e, billing: { ...e.billing, paidUntil: v || null } }));
  }

  function setLimit(key: "maxOrdersPerMonth" | "maxStaffAccounts", v: string) {
    const n = v.trim() === "" ? null : Math.max(0, parseInt(v, 10) || 0);
    setEnt((e) => ({ ...e, limits: { ...e.limits, [key]: n } }));
  }

  async function onSave() {
    try {
      await save.mutateAsync(ent);
      toast.success("Module licensing saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save — is your login email set as the platform owner?");
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  // Group reports by their resolved section, in the same order they appear in REPORTS_GROUP.
  const reportsBySection: { section: string; items: typeof REPORTS_GROUP.children }[] = [];
  REPORTS_GROUP.children.forEach((leaf) => {
    const section = resolveReportSection(leaf.href) || "Other";
    const bucket = reportsBySection.find((b) => b.section === section);
    if (bucket) bucket.items.push(leaf);
    else reportsBySection.push({ section, items: [leaf] });
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            Billing
            {isLicenseExpired(ent) && <Badge variant="destructive">Expired</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Paid until</Label>
            <Input type="date" value={ent.billing?.paidUntil || ""} onChange={(e) => setPaidUntil(e.target.value)} />
            <p className="text-xs text-muted-foreground">Blank = never expires. Set manually for cash/bank-transfer customers, or leave for Razorpay to update automatically.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Last payment</Label>
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {ent.billing?.lastPaymentAt ? fmtDate(ent.billing.lastPaymentAt) : "No payment recorded yet"}
              {ent.billing?.razorpaySubscriptionId && ` · Razorpay: ${ent.billing.razorpaySubscriptionId}`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Modules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {MODULE_CATALOG.map((m) => (
            <CheckRow key={m.id} label={m.label} description={m.description} checked={isModuleEnabled(ent, m.id)} onChange={(v) => toggleModule(m.id, v)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Usage Limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Max orders per month</Label>
            <Input type="number" min={0} placeholder="Unlimited" value={ent.limits?.maxOrdersPerMonth ?? ""} onChange={(e) => setLimit("maxOrdersPerMonth", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Max staff accounts</Label>
            <Input type="number" min={0} placeholder="Unlimited" value={ent.limits?.maxStaffAccounts ?? ""} onChange={(e) => setLimit("maxStaffAccounts", e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Soft caps only — never blocks a customer from working, just shows a warning once exceeded.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reportsBySection.map(({ section, items }) => {
            const owningModule = reportOwningModule(section);
            const moduleOff = owningModule ? !isModuleEnabled(ent, owningModule) : false;
            return (
              <div key={section}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section}
                  {moduleOff && " — module disabled above"}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((leaf) => (
                    <CheckRow key={leaf.href} label={leaf.label} checked={ent.reports[leaf.href] !== false} disabled={moduleOff} onChange={(v) => toggleReport(leaf.href, v)} />
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Dashboard Widgets</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 sm:grid-cols-2">
          {BUILTIN_WIDGETS.map((w) => {
            const owningModule = widgetOwningModule(w.key);
            const moduleOff = owningModule ? !isModuleEnabled(ent, owningModule) : false;
            return (
              <CheckRow key={w.key} label={w.title} description={w.description} checked={ent.widgets[w.key] !== false} disabled={moduleOff} onChange={(v) => toggleWidget(w.key, v)} />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Settings Menu</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 sm:grid-cols-2">
          {[...SETTINGS_GROUP.children, ...EMPLOYEES_GROUP.children.filter((leaf) => leaf.href.startsWith("/settings/"))]
            .filter((leaf) => !SETTINGS_ALWAYS_ENABLED.includes(leaf.href))
            .map((leaf) => (
              <CheckRow key={leaf.href} label={leaf.label} checked={ent.settings[leaf.href] !== false} onChange={(v) => toggleSetting(leaf.href, v)} />
            ))}
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Account and Module Licensing always stay reachable and aren&apos;t shown here. Includes settings pages that live under the Employees menu (Attendance &amp; Payroll, Leave Policy, Tailor Payable Rates, Users &amp; Roles).
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={save.isPending} onClick={onSave}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
