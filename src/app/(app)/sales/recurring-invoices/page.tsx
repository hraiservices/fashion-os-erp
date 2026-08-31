"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Plus, Repeat, Play, Pause, Pencil, Trash2 } from "lucide-react";
import {
  useRecurringInvoiceProfiles,
  useGenerateRecurringInvoiceNow,
  useSetRecurringInvoiceProfileActive,
  useDeleteRecurringInvoiceProfile,
} from "@/hooks/use-recurring-invoices";
import { useCurrentUser } from "@/hooks/use-current-user";
import { recurringProfileIsDue, recurringProfileHasEnded, RECURRING_FREQUENCY_LABELS } from "@/lib/recurring-invoices";
import { fmtDate, inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";

export default function RecurringInvoicesPage() {
  const { data: user } = useCurrentUser();
  const { data: profiles, isLoading } = useRecurringInvoiceProfiles();
  const generateNow = useGenerateRecurringInvoiceNow();
  const setActive = useSetRecurringInvoiceProfileActive();
  const deleteProfile = useDeleteRecurringInvoiceProfile();
  const canManage = !!user?.perms.manageSales;

  async function handleGenerateNow(profile: NonNullable<typeof profiles>[number]) {
    try {
      const res = await generateNow.mutateAsync({ profile, userEmail: user?.email });
      toast.success(`Generated invoice ${res.invoiceNumber} as draft`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate invoice");
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    try {
      await setActive.mutateAsync({ id, active: !active });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete recurring profile "${name}"? This does not affect invoices already generated.`)) return;
    try {
      await deleteProfile.mutateAsync({ id, name, userEmail: user?.email });
      toast.success("Profile deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Recurring Invoices"
        description={`${profiles?.length ?? 0} profiles — each generates a Draft invoice on schedule for you to review and send`}
        actions={
          canManage && (
            <Button nativeButton={false} render={<Link href="/sales/recurring-invoices/new" />}>
              <Plus className="size-4" /> New profile
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !profiles || profiles.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring invoice profiles yet"
          description="Set up a profile for a customer with a fixed monthly/weekly charge — it'll create a draft invoice automatically on schedule."
          action={
            canManage && (
              <Button nativeButton={false} render={<Link href="/sales/recurring-invoices/new" />}>
                <Plus className="size-4" /> New profile
              </Button>
            )
          }
        />
      ) : (
        <div className="hidden overflow-hidden rounded-xl border sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => {
                const ended = recurringProfileHasEnded(p);
                const due = recurringProfileIsDue(p);
                const total = p.items.reduce((s, i) => s + i.amount, 0);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <p>{p.customerName}</p>
                      <p className="text-xs text-muted-foreground">{p.customerMobile}</p>
                    </TableCell>
                    <TableCell>{RECURRING_FREQUENCY_LABELS[p.frequency]}</TableCell>
                    <TableCell className={due ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>{fmtDate(p.nextRunDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(total)}</TableCell>
                    <TableCell>
                      {ended ? (
                        <Badge variant="outline">Ended</Badge>
                      ) : p.active ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Paused</Badge>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => handleGenerateNow(p)} disabled={generateNow.isPending || ended || !due} title={!ended && !due ? "Not due yet" : undefined}>
                            Generate now
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleToggleActive(p.id, p.active)} disabled={ended} aria-label={p.active ? "Pause" : "Resume"}>
                            {p.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/sales/recurring-invoices/${p.id}/edit`} />} aria-label="Edit">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(p.id, p.name)} aria-label="Delete">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && profiles && profiles.length > 0 && (
        <MobileRecordList>
          {profiles.map((p) => {
            const ended = recurringProfileHasEnded(p);
            const due = recurringProfileIsDue(p);
            const total = p.items.reduce((s, i) => s + i.amount, 0);
            return (
              <MobileRecordCard key={p.id}>
                <MobileRecordHeader title={p.name} subtitle={p.customerName} value={inr(total)} showChevron={false} />
                <MobileRecordRow label="Mobile" value={p.customerMobile} />
                <MobileRecordRow label="Frequency" value={RECURRING_FREQUENCY_LABELS[p.frequency]} />
                <MobileRecordRow
                  label="Next run"
                  value={fmtDate(p.nextRunDate)}
                  valueClassName={due ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}
                />
                <MobileRecordRow
                  label="Status"
                  value={ended ? <Badge variant="outline">Ended</Badge> : p.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Paused</Badge>}
                />
                {canManage && (
                  <div className="flex justify-end gap-1 pt-1">
                    <Button variant="outline" size="sm" onClick={() => handleGenerateNow(p)} disabled={generateNow.isPending || ended || !due} title={!ended && !due ? "Not due yet" : undefined}>
                      Generate now
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" onClick={() => handleToggleActive(p.id, p.active)} disabled={ended} aria-label={p.active ? "Pause" : "Resume"}>
                      {p.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" nativeButton={false} render={<Link href={`/sales/recurring-invoices/${p.id}/edit`} />} aria-label="Edit">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="size-11 sm:size-7" onClick={() => handleDelete(p.id, p.name)} aria-label="Delete">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </MobileRecordCard>
            );
          })}
        </MobileRecordList>
      )}
    </div>
  );
}
