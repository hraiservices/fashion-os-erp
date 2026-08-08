"use client";

import Link from "next/link";
import { Plus, FileText, ChevronRight } from "lucide-react";
import { useSalesQuotations } from "@/hooks/use-sales-quotations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { inr, fmtDate } from "@/lib/format";
import { QUOTE_STATUS_LABELS } from "@/lib/sales";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function QuotationsPage() {
  const { data: quotes, isLoading } = useSalesQuotations();
  const { data: user } = useCurrentUser();
  const canManage = !!user?.perms.manageSales;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Quotations"
        description={`${quotes?.length ?? 0} quotations`}
        actions={
          canManage && (
            <Button nativeButton={false} render={<Link href="/sales/quotations/new" />}>
              <Plus className="size-4" /> New quotation
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !quotes || quotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotations yet"
          description="Create a quotation to send a price estimate before converting it to an invoice."
          action={
            canManage && (
              <Button nativeButton={false} render={<Link href="/sales/quotations/new" />}>
                <Plus className="size-4" /> New quotation
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {quotes.map((q) => (
            <Link key={q.id} href={`/sales/quotations/${q.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{q.quoteNumber}</span>
                  <Badge variant="outline">{QUOTE_STATUS_LABELS[q.status]}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {q.customerName} · {fmtDate(q.date)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(q.total)}</p>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
