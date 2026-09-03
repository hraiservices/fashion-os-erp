"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Wallet, CheckCircle2, Trash2, FileDown, PencilLine, MessageCircle } from "lucide-react";
import { usePayrollRun, usePayslipsForRun } from "@/hooks/use-payroll";
import { useFinalizePayrollRun, useMarkPayslipPaid, useDeletePayrollRun, useAdjustPayslip } from "@/hooks/use-payroll-mutations";
import { useEmployees } from "@/hooks/use-employees";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useRouter } from "next/navigation";
import { inr, fmtDate } from "@/lib/format";
import { buildPayslipWhatsAppUrl } from "@/lib/payslip-whatsapp";
import { cn } from "@/lib/utils";
import type { Payslip } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordList, MobileRecordCard, MobileRecordHeader, MobileRecordRow } from "@/components/ui/mobile-record-list";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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

export default function PayrollRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: run, isLoading: runLoading } = usePayrollRun(id);
  const { data: payslips, isLoading: payslipsLoading } = usePayslipsForRun(id);
  const { data: employees } = useEmployees();
  const { data: user } = useCurrentUser();
  const { data: shop } = useShopSettings();
  const finalizeRun = useFinalizePayrollRun();
  const markPaid = useMarkPayslipPaid();
  const deleteRun = useDeletePayrollRun();
  const adjustPayslip = useAdjustPayslip();

  const [adjusting, setAdjusting] = useState<Payslip | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  const employee = (empId: string) => (employees || []).find((e) => e.id === empId);
  const employeeName = (empId: string) => employee(empId)?.name || "—";

  function openAdjust(p: Payslip) {
    setAdjusting(p);
    setAdjustAmount(p.adjustmentAmount ? String(p.adjustmentAmount) : "");
    setAdjustNote(p.notes);
  }

  async function handleSaveAdjustment() {
    if (!adjusting) return;
    const amount = Number(adjustAmount) || 0;
    try {
      await adjustPayslip.mutateAsync({ id: adjusting.id, amount, note: adjustNote });
      toast.success("Adjustment saved");
      setAdjusting(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save adjustment");
    }
  }

  function notifyHref(p: Payslip) {
    const emp = employee(p.employeeId);
    if (!emp || !run) return undefined;
    return buildPayslipWhatsAppUrl(emp, p, run, shop?.name);
  }

  async function handleFinalize() {
    try {
      await finalizeRun.mutateAsync({ id, userEmail: user?.email });
      toast.success("Payroll run finalized");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to finalize");
    }
  }

  async function handleMarkPaid(payslipId: string) {
    try {
      await markPaid.mutateAsync({ id: payslipId });
      toast.success("Marked as paid");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleDeleteRun() {
    try {
      await deleteRun.mutateAsync({ id, userEmail: user?.email });
      toast.success("Payroll run deleted");
      router.push("/employees/payroll");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  if (runLoading || payslipsLoading) {
    return (
      <div className="p-4 sm:p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6">
        <EmptyState icon={Wallet} title="Payroll run not found" />
      </div>
    );
  }

  const totalNet = (payslips || []).reduce((s, p) => s + p.netPay, 0);
  const allPaid = (payslips || []).length > 0 && (payslips || []).every((p) => p.status === "paid");

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link href="/employees/payroll" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Payroll
      </Link>
      <PageHeader
        title={`${fmtDate(run.periodStart)} – ${fmtDate(run.periodEnd)}`}
        description={`${(payslips || []).length} payslips · Total net pay ${inr(totalNet)}`}
        actions={
          <>
            <Badge variant={run.status === "finalized" ? "secondary" : "outline"}>{run.status === "finalized" ? "Finalized" : "Draft"}</Badge>
            {run.status === "draft" && (
              <>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="destructive"><Trash2 className="size-4" /> Delete</Button>} />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this payroll run?</AlertDialogTitle>
                      <AlertDialogDescription>This removes all its payslips and un-links any advances that were deducted against them. This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteRun}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button onClick={handleFinalize} disabled={finalizeRun.isPending}>
                  <CheckCircle2 className="size-4" /> Finalize
                </Button>
              </>
            )}
          </>
        }
      />

      {!payslips || payslips.length === 0 ? (
        <EmptyState icon={Wallet} title="No payslips" description="No active employees at the time this run was generated." />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Present</TableHead>
                  <TableHead className="text-right">Absent</TableHead>
                  <TableHead className="text-right">Half day</TableHead>
                  <TableHead className="text-right">Leave</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Piece-rate</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Adjustment</TableHead>
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{employeeName(p.employeeId)}</TableCell>
                    <TableCell className="text-right">{p.presentDays}</TableCell>
                    <TableCell className="text-right">{p.absentDays}</TableCell>
                    <TableCell className="text-right">{p.halfDays}</TableCell>
                    <TableCell className="text-right">{p.leaveDays}</TableCell>
                    <TableCell className="text-right">{inr(p.grossPay)}</TableCell>
                    <TableCell className="text-right">{p.pieceRatePay > 0 ? inr(p.pieceRatePay) : "—"}</TableCell>
                    <TableCell className="text-right">{p.overtimeHours > 0 ? `${p.overtimeHours}h · ${inr(p.overtimePay)}` : "—"}</TableCell>
                    <TableCell className="text-right text-red-600 dark:text-red-400">{p.deductions > 0 ? `− ${inr(p.deductions)}` : "—"}</TableCell>
                    <TableCell className={cn("text-right", p.adjustmentAmount > 0 ? "text-emerald-600 dark:text-emerald-400" : p.adjustmentAmount < 0 ? "text-red-600 dark:text-red-400" : undefined)}>
                      {p.adjustmentAmount !== 0 ? `${p.adjustmentAmount > 0 ? "+" : "−"} ${inr(Math.abs(p.adjustmentAmount))}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{inr(p.netPay)}</TableCell>
                    <TableCell className="text-right">
                      {p.status === "paid" ? (
                        <Badge variant="secondary">Paid</Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleMarkPaid(p.id)} disabled={markPaid.isPending}>
                          Mark Paid
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        {p.status !== "paid" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-11 sm:size-7"
                            aria-label={`Adjust payslip for ${employeeName(p.employeeId)}`}
                            title="Adjust (bonus/deduction)"
                            onClick={() => openAdjust(p)}
                          >
                            <PencilLine className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-11 sm:size-7"
                          aria-label={`Notify ${employeeName(p.employeeId)} on WhatsApp`}
                          title="Notify on WhatsApp"
                          nativeButton={false}
                          render={<a href={notifyHref(p)} target="_blank" rel="noopener noreferrer" />}
                        >
                          <MessageCircle className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-11 sm:size-7"
                          aria-label={`Download payslip for ${employeeName(p.employeeId)}`}
                          title="Download payslip"
                          nativeButton={false}
                          render={<a href={`/api/employees/payslips/${p.id}/pdf`} target="_blank" rel="noopener noreferrer" />}
                        >
                          <FileDown className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <MobileRecordList className="p-2">
            {payslips.map((p) => (
              <MobileRecordCard key={p.id}>
                <MobileRecordHeader title={employeeName(p.employeeId)} value={inr(p.netPay)} showChevron={false} />
                <MobileRecordRow label="Present / Absent / Half / Leave" value={`${p.presentDays} / ${p.absentDays} / ${p.halfDays} / ${p.leaveDays}`} />
                <MobileRecordRow label="Gross" value={inr(p.grossPay)} />
                {p.pieceRatePay > 0 && <MobileRecordRow label="Piece-rate" value={inr(p.pieceRatePay)} />}
                {p.overtimeHours > 0 && <MobileRecordRow label="Overtime" value={`${p.overtimeHours}h · ${inr(p.overtimePay)}`} />}
                <MobileRecordRow label="Deductions" value={p.deductions > 0 ? `− ${inr(p.deductions)}` : "—"} valueClassName={p.deductions > 0 ? "text-red-600 dark:text-red-400" : undefined} />
                {p.adjustmentAmount !== 0 && (
                  <MobileRecordRow
                    label="Adjustment"
                    value={`${p.adjustmentAmount > 0 ? "+" : "−"} ${inr(Math.abs(p.adjustmentAmount))}`}
                    valueClassName={p.adjustmentAmount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
                  />
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">Status</span>
                  {p.status === "paid" ? (
                    <Badge variant="secondary">Paid</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => handleMarkPaid(p.id)} disabled={markPaid.isPending}>
                      Mark Paid
                    </Button>
                  )}
                </div>
                <div className="mt-2 flex gap-1.5">
                  {p.status !== "paid" && (
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openAdjust(p)}>
                      <PencilLine className="size-3.5" /> Adjust
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" nativeButton={false} render={<a href={notifyHref(p)} target="_blank" rel="noopener noreferrer" />}>
                    <MessageCircle className="size-3.5" /> Notify
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    nativeButton={false}
                    render={<a href={`/api/employees/payslips/${p.id}/pdf`} target="_blank" rel="noopener noreferrer" />}
                  >
                    <FileDown className="size-3.5" /> Slip
                  </Button>
                </div>
              </MobileRecordCard>
            ))}
          </MobileRecordList>
        </div>
      )}

      {allPaid && <p className="text-sm text-muted-foreground">All payslips in this run are marked paid.</p>}

      <Dialog open={!!adjusting} onOpenChange={(o) => !o && setAdjusting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust payslip{adjusting ? ` — ${employeeName(adjusting.employeeId)}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="adjust-amount">Amount</Label>
              <Input
                id="adjust-amount"
                type="number"
                inputMode="decimal"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g. 500 for a bonus, -200 for a fine"
              />
              <p className="text-xs text-muted-foreground">Positive adds a bonus to net pay; negative deducts (e.g. a fine).</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjust-note">Reason</Label>
              <Input id="adjust-note" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="e.g. Diwali bonus" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjusting(null)}>Cancel</Button>
            <Button onClick={handleSaveAdjustment} disabled={adjustPayslip.isPending}>
              {adjustPayslip.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
