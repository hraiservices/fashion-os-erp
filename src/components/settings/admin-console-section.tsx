"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Rocket,
  Link2,
  Copy,
  Package,
  Activity,
  ServerCog,
  CheckCircle2,
  XCircle,
  ArrowRight,
  UserRound,
  Users,
  Scissors,
  PlayCircle,
  KeyRound,
  ExternalLink,
} from "lucide-react";
import { useEmployees } from "@/hooks/use-employees";
import { useUserRoles } from "@/hooks/use-user-roles";
import { useCustomers } from "@/hooks/use-customers";
import { useOrders } from "@/hooks/use-orders";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { useDeploymentStatus } from "@/hooks/use-deployment-status";
import { MODULE_CATALOG } from "@/lib/entitlements";
import { fmtDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const MARKETING_SITE_URL = process.env.NEXT_PUBLIC_MARKETING_SITE_URL || "https://fashionflow.app";
const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_URL || "https://demo.fashionflow.app/login";

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

/** One row: a label, the link, copy + open buttons. Shared by every "weblinks" list below. */
function LinkRow({ label, sublabel, url }: { label: string; sublabel?: string; url: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{label}</p>
        {sublabel && <p className="truncate text-xs text-muted-foreground">{sublabel}</p>}
        <p className="truncate font-mono text-xs text-muted-foreground">{url}</p>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={() => copy(url, label)} aria-label={`Copy ${label} link`}>
        <Copy className="size-3.5" />
      </Button>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <Button variant="ghost" size="icon-sm" aria-label={`Open ${label} link`}>
          <ExternalLink className="size-3.5" />
        </Button>
      </a>
    </div>
  );
}

function SectionCard({ icon: Icon, title, description, children }: { icon: typeof Rocket; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

const ONBOARDING_STEPS = [
  { title: "Lead comes in", body: "Someone submits the form at /signup, or you get one directly (WhatsApp, call, referral). Every form submission lands in Settings → Signup Requests, status \"new\"." },
  { title: "Mark it contacted", body: "Once you've talked to them and agreed on a tier (see Module/Tier Snapshot below for the standard Starter/Growth/Pro pricing), mark the request \"contacted\" in Signup Requests." },
  { title: "Provision the deployment", body: "Run scripts/onboard-customer.mjs from your machine — it creates their own Supabase project, runs every migration, applies the module entitlements for their tier, creates a Vercel project, and sets every env var. Takes a few minutes; --dry-run first if unsure." },
  { title: "Configure their tier", body: "Log into their new deployment with your owner email, go to Settings → Module Licensing, and check on whichever modules match what they paid for. Effective immediately." },
  { title: "Set up billing", body: "Manual (cash/bank transfer): set \"Paid until\" on the Billing card yourself. Razorpay auto-billing: run add_billing_events.sql, add RAZORPAY_WEBHOOK_SECRET to their env vars, point their Razorpay subscription webhook at their deployment." },
  { title: "White-label if needed", body: "Not automated: swap public/icon*.svg + the viewport.themeColor in their deployment's src/app/layout.tsx before their first real login, if they're paying for their own branding." },
  { title: "Hand off login details", body: "Their first login uses /login's \"Sign up\" tab (only enabled on a fresh deployment, via NEXT_PUBLIC_ENABLE_SELF_SIGNUP) — the very first account created becomes their admin. Mark the signup request \"provisioned\"." },
];

/** Platform-owner-only operational reference: onboarding steps, every live link this deployment
 *  hands out, and a quick health/status snapshot — all in one place instead of scattered across
 *  docs, scripts, and other Settings pages. See the platform-owner AskUserQuestion answers this
 *  page was built from: onboarding steps written fresh (not pulled from the repo docs), weblinks
 *  are live data (not just a reference list), page is superAdmin-only. */
export function AdminConsoleSection() {
  const { data: employees, isLoading: l1 } = useEmployees();
  const { data: userRoles, isLoading: l2 } = useUserRoles();
  const { data: customers, isLoading: l3 } = useCustomers();
  const { data: orders, isLoading: l4 } = useOrders();
  const { data: entitlements, isLoading: l5 } = useModuleEntitlements();
  const { data: deployStatus, isLoading: l6 } = useDeploymentStatus();
  const [customerSearch, setCustomerSearch] = useState("");

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6;

  const dashboardAccessRows = useMemo(() => {
    if (!userRoles || !employees) return [];
    const employeeById = new Map(employees.map((e) => [e.id, e]));
    return userRoles
      .filter((r) => r.linked_employee_id)
      .map((r) => ({ role: r, employee: employeeById.get(r.linked_employee_id!) }))
      .filter((r) => r.employee);
  }, [userRoles, employees]);

  const customersWithLinks = useMemo(() => {
    if (!customers) return [];
    const q = customerSearch.trim().toLowerCase();
    return customers
      .filter((c) => c.shareToken)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.mobile.includes(q))
      .slice(0, 25);
  }, [customers, customerSearch]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const usageSnapshot = useMemo(() => {
    if (!orders || !employees) return null;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const ordersThisMonth = orders.filter((o) => o.inDate >= monthStart).length;
    const activeStaff = employees.filter((e) => e.active).length;
    return { ordersThisMonth, activeStaff, totalCustomers: customers?.length || 0 };
  }, [orders, employees, customers]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/settings/module-licensing">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Package className="size-3.5" /> Module Licensing <ArrowRight className="size-3" />
          </Button>
        </Link>
        <Link href="/settings/signup-requests">
          <Button variant="outline" size="sm" className="gap-1.5">
            <UserRound className="size-3.5" /> Signup Requests <ArrowRight className="size-3" />
          </Button>
        </Link>
      </div>

      <SectionCard icon={ServerCog} title="Deployment status" description="Env-var configuration on this deployment — never shows actual secret values.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { label: "Service role key (admin actions)", ok: deployStatus?.hasServiceRoleKey },
            { label: "Razorpay webhook secret", ok: deployStatus?.hasRazorpayWebhookSecret },
            { label: "Attendance session secret", ok: deployStatus?.hasAttendanceSessionSecret },
            { label: "Self-signup enabled (fresh-deployment first login)", ok: deployStatus?.selfSignupEnabled },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              {row.ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <XCircle className="size-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate text-xs">{row.label}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard icon={Package} title="Module / tier snapshot" description="What's currently licensed on THIS deployment. Change it in Module Licensing.">
        <div className="flex flex-wrap gap-1.5">
          {MODULE_CATALOG.map((m) => (
            <Badge key={m.id} variant={entitlements?.modules[m.id] ? "default" : "outline"} className="text-xs">
              {m.label}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Paid until: <span className="font-medium text-foreground">{entitlements?.billing.paidUntil ? fmtDate(entitlements.billing.paidUntil) : "never expires / not set"}</span>
        </p>
      </SectionCard>

      <SectionCard icon={Activity} title="Usage snapshot" description="A quick health check, without the separate usage-report script.">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border p-3">
            <p className="text-lg font-semibold">{usageSnapshot?.ordersThisMonth ?? 0}</p>
            <p className="text-xs text-muted-foreground">Orders this month</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-lg font-semibold">{usageSnapshot?.activeStaff ?? 0}</p>
            <p className="text-xs text-muted-foreground">Active staff</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-lg font-semibold">{usageSnapshot?.totalCustomers ?? 0}</p>
            <p className="text-xs text-muted-foreground">Customers</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Rocket} title="New client onboarding process">
        <ol className="space-y-3">
          {ONBOARDING_STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard icon={Link2} title="Shop-wide links" description="Same URL for everyone — not tied to a specific person.">
        <LinkRow label="Login (staff + owner)" url={`${origin}/login`} />
        <LinkRow label="Self-service attendance check-in" url={`${origin}/checkin`} />
        <LinkRow label="Signup request form" sublabel="Marketing site prospects land here" url={`${origin}/signup`} />
        <LinkRow label="Try-it demo" sublabel="Handed to prospects on the signup success screen" url={DEMO_URL} />
        <LinkRow label="Marketing site" url={MARKETING_SITE_URL} />
      </SectionCard>

      <SectionCard icon={Users} title="Employee dashboard access" description="Everyone with a mobile+PIN login into this deployment. There's no per-person URL — everyone signs in at the same /login above with their own mobile number and PIN.">
        {dashboardAccessRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No employees have dashboard access set up yet.</p>
        ) : (
          dashboardAccessRows.map(({ role, employee }) => (
            <div key={role.email} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <Scissors className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{employee!.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Mobile <span className="font-mono">{role.phone || employee!.mobile}</span> · role {role.role}
                </p>
              </div>
              <Link href={`/employees/${employee!.id}`}>
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  View <ArrowRight className="size-3" />
                </Button>
              </Link>
            </div>
          ))
        )}
      </SectionCard>

      <SectionCard icon={KeyRound} title="Customer order-tracking links" description="Each customer's own live /track/<token> link — resend if a WhatsApp send failed.">
        <Input placeholder="Search by name or mobile…" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} className="h-9" />
        {customersWithLinks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No matching customers with a tracking link yet.</p>
        ) : (
          <>
            {customersWithLinks.map((c) => (
              <LinkRow key={c.id} label={c.name || c.mobile} sublabel={c.mobile} url={`${origin}/track/${c.shareToken}`} />
            ))}
            {customers && customers.filter((c) => c.shareToken).length > 25 && (
              <p className="text-center text-xs text-muted-foreground">Showing first 25 — search to narrow down.</p>
            )}
          </>
        )}
      </SectionCard>

      <p className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <PlayCircle className="size-3.5 shrink-0" />
        More sections can be added here later as needed — this page is yours to extend.
      </p>
    </div>
  );
}
