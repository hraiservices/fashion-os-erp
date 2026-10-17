"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateTask } from "@/hooks/use-targets";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { istDateString } from "@/lib/ist-date";
import { TRIAL_TAG, prettyTime, trialDescription, trialMessage, trialTitle } from "@/lib/trial";
import { addDaysIso } from "@/lib/work-tasks";

const label = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** Book a fitting trial for an order: it becomes a task for the day (with a reminder) and a WhatsApp confirmation for the customer. */
export function TrialScheduleButton({ order, shopName, className }: { order: { id: string; name: string; mobile: string }; shopName: string; className?: string }) {
  const create = useCreateTask();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => addDaysIso(istDateString(), 1));
  const [time, setTime] = useState("17:00");

  async function save(sendWhatsApp: boolean) {
    try {
      await create.mutateAsync({
        title: trialTitle(order.name, order.id, prettyTime(time)),
        description: trialDescription(order.mobile, order.id),
        dueDate: date,
        tags: [TRIAL_TAG],
        linkType: "order",
        linkId: order.id,
        reminder: "on_due",
      });
      toast.success(`Trial booked for ${label(date)}${time ? ` at ${prettyTime(time)}` : ""}`);
      setOpen(false);
      if (sendWhatsApp) {
        const text = trialMessage({ name: order.name, shop: shopName, dateLabel: label(date), time: prettyTime(time) });
        window.open(`https://wa.me/91${normalizeIndianMobile(order.mobile)}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't book the trial");
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className={className} onClick={() => setOpen(true)}>
        <CalendarClock className="size-4 shrink-0" /> <span className="min-w-0 truncate">Book trial</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Book a fitting trial</DialogTitle>
            <DialogDescription>
              {order.name} · order {order.id}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-6">
            <label className="block space-y-1 text-sm font-medium">
              Date
              <Input type="date" value={date} min={istDateString()} onChange={(e) => setDate(e.target.value)} className="h-12 text-base" />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Time
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12 text-base" />
            </label>
            <div className="flex flex-col gap-2 pt-1">
              <Button type="button" className="h-12" disabled={!date || create.isPending} onClick={() => save(true)}>
                {create.isPending && <Loader2 className="size-4 animate-spin" />} Book &amp; send WhatsApp
              </Button>
              <Button type="button" variant="outline" className="h-12" disabled={!date || create.isPending} onClick={() => save(false)}>
                Book only
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
