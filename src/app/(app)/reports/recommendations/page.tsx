"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, Send, CheckCircle2, TrendingUp } from "lucide-react";
import { useCustomerRecommendations } from "@/hooks/use-customer-recommendations";
import { useSalesInvoices } from "@/hooks/use-sales-invoices";
import { ReportShell, ReportCard } from "@/components/reports/report-shell";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { useReportDateRange, isWithinDateRange } from "@/lib/report-date-range";

/**
 * Phase 8: "is this feature actually generating sales?" — cross-references every logged
 * recommendation (Phase 6) against sales_invoices to see whether the customer went on to buy
 * that exact product afterward. A recommendation counts as converted if the customer has an
 * invoice for the same product_id dated after the recommendation was sent — a simple,
 * auditable attribution rule, not a statistical model.
 */
export default function RecommendationsReportPage() {
  const { data: recommendations, isLoading: recsLoading } = useCustomerRecommendations();
  const { data: invoices, isLoading: invoicesLoading } = useSalesInvoices();

  const isLoading = recsLoading || invoicesLoading;
  const [channel, setChannel] = useState<"all" | "whatsapp_api" | "wa_me">("all");
  const { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range } = useReportDateRange();

  const rows = useMemo(() => {
    if (!recommendations || !invoices) return [];
    return recommendations
      .filter((rec) => isWithinDateRange(rec.createdAt, range))
      .filter((rec) => channel === "all" || (channel === "wa_me" ? rec.channel !== "whatsapp_api" : rec.channel === "whatsapp_api"))
      .map((rec) => {
        const convertedInvoice = invoices.find(
          (inv) =>
            inv.customerMobile === rec.customerMobile &&
            new Date(inv.invoiceDate).getTime() >= new Date(rec.createdAt).getTime() &&
            inv.items.some((it) => it.productId === rec.productId)
        );
        return { rec, converted: !!convertedInvoice, convertedDate: convertedInvoice?.invoiceDate };
      });
  }, [recommendations, invoices, range, channel]);

  const totalSent = rows.length;
  const viaApi = rows.filter((r) => r.rec.channel === "whatsapp_api").length;
  const viaWaMe = totalSent - viaApi;
  const converted = rows.filter((r) => r.converted).length;
  const conversionRate = totalSent > 0 ? Math.round((converted / totalSent) * 100) : 0;

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <ReportShell title="Recommendation Performance" description="Product recommendations sent to customers, and whether they led to a sale">
      {(recommendations || []).length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No recommendations sent yet"
          description="Send a WhatsApp recommendation from a product's edit page or a customer's profile to start tracking this."
        />
      ) : (
        <>
          <ReportFilterBar
            preset={preset}
            onPresetChange={setPreset}
            customFrom={customFrom}
            onCustomFromChange={setCustomFrom}
            customTo={customTo}
            onCustomToChange={setCustomTo}
            resultLabel={`${totalSent} recommendation${totalSent === 1 ? "" : "s"}`}
            category={
              <Select value={channel} onValueChange={(v) => v && setChannel(v as typeof channel)}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue>{channel === "all" ? "All Channels" : channel === "whatsapp_api" ? "API" : "wa.me"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="whatsapp_api">API</SelectItem>
                  <SelectItem value="wa_me">wa.me</SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Recommendations sent" value={totalSent} icon={Send} />
            <StatCard label="Via WhatsApp API" value={viaApi} hint={`${viaWaMe} via wa.me`} icon={Sparkles} />
            <StatCard label="Converted to a sale" value={converted} icon={CheckCircle2} tone="success" />
            <StatCard label="Conversion rate" value={`${conversionRate}%`} icon={TrendingUp} tone={conversionRate > 0 ? "success" : "default"} />
          </div>

          <ReportCard>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Match</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map(({ rec, converted, convertedDate }) => (
                    <TableRow key={rec.id}>
                      <TableCell>
                        <Link href={`/crm/${rec.customerMobile}`} className="font-medium hover:underline">{rec.customerName}</Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/inventory/products/${rec.productId}/edit`} className="hover:underline">{rec.productName}</Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{rec.score}%</TableCell>
                      <TableCell>
                        <Badge variant={rec.channel === "whatsapp_api" ? "secondary" : "outline"}>
                          {rec.channel === "whatsapp_api" ? "API" : "wa.me"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(rec.createdAt)}</TableCell>
                      <TableCell>
                        {converted ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-3.5" /> Bought {convertedDate ? fmtDate(convertedDate) : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ReportCard>
        </>
      )}
    </ReportShell>
  );
}
