"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Ruler, Download, User } from "lucide-react";
import { useCustomerProfiles } from "@/hooks/use-customer-profiles";
import { useEmployees } from "@/hooks/use-employees";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { hasMeasurements } from "@/lib/measurements";
import { CustomerMeasurements } from "@/components/crm/customer-measurements";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CustomerProfile } from "@/lib/crm";

/** WhatsApp text summary of a customer's saved measurements (no PDF attachment — WhatsApp's
 *  click-to-chat scheme only supports pre-filled text, not files). */
function buildMeasurementMessage(cust: CustomerProfile): string {
  const entries = Object.entries(cust.measurements || {}).filter(([, v]) => v != null && String(v).trim() !== "");
  const lines = entries.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
  return (
    `Measurements for *${cust.name}* (${cust.mobile})\n\n` +
    (lines.length ? lines.join("\n") : "No measurements saved yet.")
  );
}

function measurementWaUrl(mobile: string, message: string): string {
  return `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(message)}`;
}

function SendToTailorDialog({ open, onOpenChange, message }: { open: boolean; onOpenChange: (v: boolean) => void; message: string }) {
  const { data: employees, isLoading } = useEmployees();
  const tailors = (employees || []).filter((e) => e.active && e.role.toLowerCase() === "tailor" && e.mobile);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send to tailor</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : tailors.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No active tailor has a mobile number on file. Add one under Employees.
          </p>
        ) : (
          <div className="space-y-2">
            {tailors.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.mobile}</p>
                </div>
                <WhatsAppButton href={measurementWaUrl(t.mobile, message)} label="Send" size="sm" />
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function MeasurementsSearchPage() {
  const { profiles, isLoading } = useCustomerProfiles();
  const [query, setQuery] = useState("");
  const [selectedMobile, setSelectedMobile] = useState<string | null>(null);
  const [tailorDialogOpen, setTailorDialogOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q));
  }, [profiles, query]);

  const selected = selectedMobile ? profiles.find((c) => c.mobile === selectedMobile) || null : null;
  const message = selected ? buildMeasurementMessage(selected) : "";

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="size-4" /> Orders
      </Link>
      <div className="print:hidden">
        <PageHeader title="Measurements" description="Search a customer by name or mobile to view, print, export, or WhatsApp their measurement card" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Search + results — hidden on print, only the selected card prints. */}
        <div className="space-y-3 print:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" enterKeyHint="search" placeholder="Search name or mobile…" className="h-10 pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : results.length === 0 ? (
            <EmptyState icon={User} title="No customers found" description="Try a different name or mobile number." />
          ) : (
            <div className="max-h-[70vh] space-y-1.5 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={c.mobile}
                  type="button"
                  onClick={() => setSelectedMobile(c.mobile)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selectedMobile === c.mobile ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {c.name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.mobile}</p>
                  </div>
                  {hasMeasurements(c.measurements) && <Ruler className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected customer's measurement card — this is what prints. */}
        <div>
          {!selected ? (
            <div className="print:hidden">
              <EmptyState icon={Ruler} title="Select a customer" description="Choose someone from the search results to view their measurement card." />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <PrintButton />
                <Button variant="outline" nativeButton={false} render={<a href={`/api/customers/${encodeURIComponent(selected.mobile)}/measurements/pdf`} target="_blank" rel="noopener noreferrer" />}>
                  <Download className="size-4" /> Download PDF
                </Button>
                <WhatsAppButton href={measurementWaUrl(selected.mobile, message)} label="Send to Customer" />
                <Button variant="outline" onClick={() => setTailorDialogOpen(true)}>
                  Send to Tailor
                </Button>
              </div>

              <CustomerMeasurements cust={selected} />
            </div>
          )}
        </div>
      </div>

      {selected && <SendToTailorDialog open={tailorDialogOpen} onOpenChange={setTailorDialogOpen} message={message} />}
    </div>
  );
}
