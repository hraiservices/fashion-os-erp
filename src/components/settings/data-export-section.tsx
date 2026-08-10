"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Every business-data table — deliberately excludes internal/system tables (app_settings, activity_log, chatbot_messages, admin_notifications, user_dashboard_layout, billing_events) which are operational noise, not "my data" a customer would want in a portable export. */
const EXPORT_TABLES = [
  "orders",
  "customers",
  "price_lists",
  "price_list_items",
  "expenses",
  "product_cost_sheets",
  "cost_sheet_items",
  "units_of_measure",
  "raw_materials",
  "products",
  "bill_of_materials",
  "inventory_ledger",
  "warehouses",
  "vendors",
  "purchase_orders",
  "purchase_bills",
  "vendor_payments",
  "vendor_credits",
  "sales_quotations",
  "sales_invoices",
  "sales_payments",
  "pos_sessions",
  "sales_credit_notes",
  "recurring_invoice_profiles",
  "work_orders",
  "employees",
  "employee_advances",
  "payroll_runs",
  "payslips",
  "employee_attendance",
] as const;

/** Settings > Account — "Download all my data". Admin-only (includes payroll/salary data). Bundles every business table into one JSON file, client-side, no server route needed — mirrors the Blob-download pattern exportCSV() already uses in lib/export.ts. */
export function DataExportSection() {
  const { data: user } = useCurrentUser();
  const [busy, setBusy] = useState(false);

  if (user?.role !== "admin") return null;

  async function handleExport() {
    setBusy(true);
    try {
      const supabase = createClient();
      const tables: Record<string, unknown[]> = {};
      for (const table of EXPORT_TABLES) {
        const { data, error } = await supabase.from(table).select("*");
        if (error) throw new Error(`${table}: ${error.message}`);
        tables[table] = data || [];
      }

      const bundle = { exportedAt: new Date().toISOString(), tables };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
      a.download = `fashion-os-erp-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Export downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Download all my data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Exports every order, customer, invoice, inventory record, and other business data as one JSON file — useful as a backup, or if you ever move off this app.
        </p>
        <Button variant="outline" disabled={busy} onClick={handleExport}>
          <Download className="size-4" /> {busy ? "Exporting…" : "Download all my data"}
        </Button>
      </CardContent>
    </Card>
  );
}
