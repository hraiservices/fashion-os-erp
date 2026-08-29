"use client";

import { RefreshCw, MessageSquare } from "lucide-react";
import { useWhatsAppMessageLog } from "@/hooks/use-whatsapp-message-log";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const TYPE_LABELS: Record<string, string> = {
  concierge_reply: "Concierge reply",
  ready_nudge: "Ready for pickup",
  daily_briefing: "Daily briefing",
  payment_reminder: "Payment reminder",
  recommendation: "Recommendation",
  sales_template: "Sales template",
};

const STATUS_CLASSES: Record<string, string> = {
  sent: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  delivered: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  read: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Every automated WhatsApp send attempt in one place — concierge replies, ready-for-pickup
 *  nudges, the daily briefing, payment reminders, and recommendations. Delivered/read statuses
 *  come from Meta's own webhook callbacks (src/app/api/webhooks/whatsapp), so a row can still
 *  say "sent" for a while before Meta reports it delivered. */
export function WhatsAppSendLogSection() {
  const { data: rows, isLoading, refetch, isFetching } = useWhatsAppMessageLog();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm">Send log</CardTitle>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !rows || rows.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No WhatsApp sends yet" description="Every automated send attempt will show up here." />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}</TableCell>
                    <TableCell className="text-sm">{TYPE_LABELS[r.messageType] || r.messageType}</TableCell>
                    <TableCell className="text-sm tabular-nums">{r.toMobile}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_CLASSES[r.status] || ""}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={r.error || undefined}>
                      {r.error || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
