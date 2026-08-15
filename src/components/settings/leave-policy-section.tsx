"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, CalendarDays, Umbrella } from "lucide-react";
import { useActiveLeaveTypes, useCreateLeaveType, useUpdateLeaveType, useDeleteLeaveType, type CreateLeaveTypeInput } from "@/hooks/use-leave-types";
import { useHolidays, useCreateHoliday, useDeleteHoliday } from "@/hooks/use-holidays";
import { fmtDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

/** Seeded once if no leave types exist yet — admin can edit/delete freely afterwards. */
const DEFAULT_LEAVE_TYPES: CreateLeaveTypeInput[] = [
  { name: "Casual Leave", annualDays: 12, paid: true, carryForward: false },
  { name: "Sick Leave", annualDays: 6, paid: true, carryForward: false },
  { name: "Unpaid Leave", annualDays: 0, paid: false, carryForward: false },
];

const BLANK_TYPE_DRAFT: CreateLeaveTypeInput = { name: "", annualDays: 12, paid: true, carryForward: false };

function LeaveTypesCard() {
  const { data: leaveTypes, isLoading } = useActiveLeaveTypes();
  const createType = useCreateLeaveType();
  const updateType = useUpdateLeaveType();
  const deleteType = useDeleteLeaveType();
  const [draft, setDraft] = useState<CreateLeaveTypeInput | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (isLoading || seeded.current) return;
    if ((leaveTypes || []).length === 0) {
      seeded.current = true;
      DEFAULT_LEAVE_TYPES.forEach((t) => createType.mutate(t));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, leaveTypes?.length]);

  async function handleSave() {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error("Name is required");
    try {
      await createType.mutateAsync(draft);
      toast.success("Leave type added");
      setDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add leave type");
    }
  }

  async function handleDelete(id: string, name: string) {
    try {
      const res = await deleteType.mutateAsync(id);
      toast.success(res.deactivated ? `"${name}" deactivated (has existing requests)` : `"${name}" deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Umbrella className="size-4" /> Leave types
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-2">
            {(leaveTypes || []).map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.annualDays} days/year · {t.paid ? "Paid" : "Unpaid"}
                    {t.carryForward ? ` · carries forward${t.maxCarryForwardDays ? ` (max ${t.maxCarryForwardDays})` : ""}` : ""}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input type="checkbox" className="size-4 rounded" checked={t.paid} onChange={(e) => updateType.mutate({ id: t.id, paid: e.target.checked })} />
                  Paid
                </label>
                <AlertDialog>
                  <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Remove ${t.name}`}><Trash2 className="size-3.5" /></Button>} />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {t.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        If any leave requests already use this type it will be deactivated (kept for history) instead of deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(t.id, t.name)}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
            {(leaveTypes || []).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No leave types yet.</p>}
          </div>
        )}

        {draft ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-medium">Name</Label>
                <Input placeholder="e.g. Casual Leave" className="h-9" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Days per year</Label>
                <NumberInput min={0} step={0.5} className="h-9" value={draft.annualDays} onChange={(v) => setDraft({ ...draft, annualDays: v })} />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" className="size-4 rounded" checked={draft.paid} onChange={(e) => setDraft({ ...draft, paid: e.target.checked })} />
                Paid
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" className="size-4 rounded" checked={draft.carryForward} onChange={(e) => setDraft({ ...draft, carryForward: e.target.checked })} />
                Carries forward to next year
              </label>
            </div>
            <div className="flex justify-end gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={createType.isPending}>Save leave type</Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setDraft(BLANK_TYPE_DRAFT)}>
            <Plus className="size-3.5" /> Add leave type
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function HolidaysCard() {
  const year = new Date().getFullYear();
  const { data: holidays, isLoading } = useHolidays(year);
  const createHoliday = useCreateHoliday();
  const deleteHoliday = useDeleteHoliday();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");

  async function handleAdd() {
    if (!name.trim() || !date) return toast.error("Name and date are required");
    try {
      await createHoliday.mutateAsync({ name: name.trim(), date });
      toast.success("Holiday added");
      setName("");
      setDate("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add holiday");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteHoliday.mutateAsync(id);
      toast.success("Holiday removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarDays className="size-4" /> Holidays ({year})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Excluded automatically when counting leave-request days.</p>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="space-y-2">
            {(holidays || []).map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(h.date)}</p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${h.name}`} onClick={() => handleDelete(h.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            {(holidays || []).length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No holidays added for {year} yet.</p>}
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs font-medium">Name</Label>
            <Input placeholder="e.g. Diwali" className="h-9" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Date</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <Button type="button" size="sm" className="gap-1.5" onClick={handleAdd} disabled={createHoliday.isPending}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function LeavePolicySection() {
  return (
    <div className="space-y-5">
      <LeaveTypesCard />
      <HolidaysCard />
    </div>
  );
}
