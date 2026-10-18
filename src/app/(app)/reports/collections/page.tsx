"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { ReportShell } from "@/components/reports/report-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { useReportsData } from "@/hooks/use-reports-data";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useAiOn, useCollectionsMessage } from "@/hooks/use-ai";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { buildCollections, collectionMessage, type CollectionRow } from "@/lib/collections";
import { istDateString } from "@/lib/ist-date";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE_STYLE = { gentle: "bg-emerald-100 text-emerald-800", friendly: "bg-amber-100 text-amber-800", firm: "bg-red-100 text-red-800" } as const;

function Row({ row, shop }: { row: CollectionRow; shop: string }) {
  const aiOn = useAiOn("collections");
  const ai = useCollectionsMessage();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? collectionMessage(row, shop, inr(row.amount));
  return (
    <li className="space-y-2 rounded-xl border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            {row.refs.slice(0, 3).join(", ")}
            {row.refs.length > 3 ? ` +${row.refs.length - 3} more` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tabular-nums">{inr(row.amount)}</p>
          <p className="text-xs text-muted-foreground">{row.daysLate > 0 ? `${row.daysLate} days late` : "due now"}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONE_STYLE[row.tone])}>{row.tone} tone</span>
        <span className="text-xs text-muted-foreground">{row.orderCount} past {row.orderCount === 1 ? "order" : "orders"}</span>
      </div>
      <p className="rounded-lg bg-muted/50 p-2 text-xs">{text}</p>
      <div className="flex gap-2">
        <WhatsAppButton href={`https://wa.me/91${normalizeIndianMobile(row.mobile)}?text=${encodeURIComponent(text)}`} label="Send reminder" className="h-11 flex-1 justify-center" />
        {aiOn && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={ai.isPending}
            onClick={() => ai.mutate({ name: row.name, amount: Math.round(row.amount), daysLate: row.daysLate, tone: row.tone, refs: row.refs.slice(0, 6), orderCount: row.orderCount }, { onSuccess: (r) => setDraft(r.text), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't write it") })}
          >
            {ai.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-violet-600" />} AI wording
          </Button>
        )}
      </div>
    </li>
  );
}

export default function CollectionsPage() {
  const { orders, isLoading } = useReportsData();
  const { data: invoices, isLoading: invLoading } = useSalesInvoices();
  const { data: shop } = useShopSettings();
  const rows = useMemo(() => buildCollections(orders, invoices || [], istDateString()), [orders, invoices]);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (isLoading || invLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;
  return (
    <ReportShell title="Collections" description="Who to chase for payment, most important first, with a message in the right tone for each. Nothing is sent until you tap Send.">
      {rows.length === 0 ? (
        <EmptyState title="Nothing to collect" description="No ready or delivered order has a balance, and no invoice is past due." />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{inr(total)}</span> pending from {rows.length} {rows.length === 1 ? "customer" : "customers"}
          </p>
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((r) => (
              <Row key={r.mobile} row={r} shop={shop?.name || ""} />
            ))}
          </ul>
        </div>
      )}
    </ReportShell>
  );
}
