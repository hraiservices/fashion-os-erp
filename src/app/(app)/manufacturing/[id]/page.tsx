"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Factory, ArrowRight, CheckCircle2, Trash2, Pencil } from "lucide-react";
import { useWorkOrder } from "@/hooks/use-work-orders";
import { useAdvanceWoStatus, useDeleteWorkOrder, useConfirmWoPayable } from "@/hooks/use-work-order-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTailorName } from "@/hooks/use-employees";
import { fmtDate, inr } from "@/lib/format";
import { WO_STATUS_LABELS, nextWoStatus } from "@/lib/manufacturing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CompleteWorkOrderDialog } from "@/components/manufacturing/complete-work-order-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: wo, isLoading } = useWorkOrder(id);
  const { data: user } = useCurrentUser();
  const advanceStatus = useAdvanceWoStatus();
  const deleteWo = useDeleteWorkOrder();
  const confirmPayable = useConfirmWoPayable();
  const tailorName = useTailorName();

  const [completeOpen, setCompleteOpen] = useState(false);

  const canManage = !!user?.perms.manageManufacturing;

  async function handleConfirmPayable() {
    if (!wo) return;
    try {
      await confirmPayable.mutateAsync(wo.id);
      toast.success("Tailor payable confirmed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to confirm payable");
    }
  }

  async function handleAdvance() {
    if (!wo) return;
    const next = nextWoStatus(wo.status);
    if (!next) return;
    if (next === "completed") {
      setCompleteOpen(true);
      return;
    }
    try {
      await advanceStatus.mutateAsync({ id: wo.id, woNumber: wo.woNumber, status: next });
      toast.success(`Moved to ${WO_STATUS_LABELS[next]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  async function handleDelete() {
    if (!wo) return;
    try {
      await deleteWo.mutateAsync({ id: wo.id, woNumber: wo.woNumber });
      toast.success("Work order deleted" + (wo.status === "completed" ? " — stock reverted" : ""));
      router.push("/manufacturing");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 w-full lg:col-span-2" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="p-6">
        <EmptyState icon={Factory} title="Work order not found" />
      </div>
    );
  }

  const next = nextWoStatus(wo.status);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/manufacturing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Manufacturing
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{wo.woNumber}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {wo.qtyToProduce}x {wo.productName} · {wo.tailor ? tailorName(wo.tailor) : "Unassigned"}
          </p>
          <p className="text-xs text-muted-foreground">
            Start {fmtDate(wo.startDate)}
            {wo.dueDate && ` · Due ${fmtDate(wo.dueDate)}`}
            {wo.completedAt && ` · Completed ${fmtDate(wo.completedAt)}`}
          </p>
        </div>
        <Badge variant={wo.status === "completed" ? "secondary" : "outline"}>{WO_STATUS_LABELS[wo.status]}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4 lg:col-span-2">
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-2 text-left font-medium">Material</th>
                  <th className="p-2 text-right font-medium">Planned</th>
                  {wo.status === "completed" && (
                    <>
                      <th className="p-2 text-right font-medium">Used</th>
                      <th className="p-2 text-right font-medium">Wasted</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {wo.materials.map((m) => (
                  <tr key={m.rawMaterialId}>
                    <td className="p-2">
                      {m.rawMaterialName} <span className="text-xs text-muted-foreground">({m.unitName})</span>
                    </td>
                    <td className="p-2 text-right tabular-nums">{m.qtyPlanned}</td>
                    {wo.status === "completed" && (
                      <>
                        <td className="p-2 text-right tabular-nums">{m.qtyUsed ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{m.qtyWasted ?? "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {wo.status === "completed" && wo.totalCost != null && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold">Cost breakdown</h2>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Material cost</span>
                  <span className="tabular-nums">{inr(wo.materialCost || 0)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Wastage cost (excluded from COGS)</span>
                  <span className="tabular-nums">{inr(wo.wastageCost || 0)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Labor cost</span>
                  <span className="tabular-nums">{inr(wo.laborCost || 0)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-medium">
                  <span>Total cost</span>
                  <span className="tabular-nums">{inr(wo.totalCost || 0)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Cost per unit</span>
                  <span className="tabular-nums">{inr(wo.costPerUnit || 0)}</span>
                </div>
              </div>
              {wo.tailor && (wo.laborCost || 0) > 0 && (
                <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-sm">
                  <div>
                    <p className="font-medium">Tailor payable</p>
                    <p className="text-xs text-muted-foreground">
                      {tailorName(wo.tailor)} · {inr(wo.laborCost || 0)} ·{" "}
                      {wo.laborPayableConfirmedAt ? "confirmed" : "awaiting confirmation"}
                    </p>
                  </div>
                  {user?.perms.managePayroll && !wo.laborPayableConfirmedAt && (
                    <Button size="sm" variant="outline" onClick={handleConfirmPayable} disabled={confirmPayable.isPending}>
                      {confirmPayable.isPending ? "Confirming…" : "Confirm"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {wo.notes && (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="mb-1 font-medium">Notes</p>
              {wo.notes}
            </div>
          )}
        </div>

        {canManage && (
          <div className="space-y-4 lg:sticky lg:top-4">
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <p className="mb-2 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Actions</p>
              {wo.status !== "completed" ? (
                <div className="space-y-1.5">
                  <Button className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]" onClick={handleAdvance} disabled={advanceStatus.isPending}>
                    {next === "completed" ? <CheckCircle2 className="size-4" /> : <ArrowRight className="size-4" />}
                    {next === "completed" ? "Complete work order" : `Move to ${next ? WO_STATUS_LABELS[next] : ""}`}
                  </Button>
                  <Button variant="outline" className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]" nativeButton={false} render={<Link href={`/manufacturing/${wo.id}/edit`} />}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  <div className="border-t pt-1.5">
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button variant="destructive" className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]"><Trash2 className="size-4" /> Delete</Button>} />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {wo.woNumber}?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="destructive" className="w-full justify-start h-12 text-base sm:h-7 sm:text-[0.8rem]"><Trash2 className="size-4" /> Delete (reverts stock)</Button>} />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {wo.woNumber}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This reverses the raw materials consumed and finished goods produced by this work order. Cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        )}
      </div>

      {canManage && <CompleteWorkOrderDialog open={completeOpen} onOpenChange={setCompleteOpen} wo={wo} />}
    </div>
  );
}
