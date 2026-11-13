"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MeasurementGrid } from "@/components/measurements/measurement-grid";
import { useUpdateOrder } from "@/hooks/use-order-mutations";
import { compactMeasurements, type MeasureLang } from "@/lib/measurements";

/**
 * Add/edit just an order's measurements, without opening the full Edit Order form — same
 * self-contained-dialog pattern as ReworkDialog. Saves only the `measurements` field, leaving
 * everything else on the order untouched.
 */
export function MeasurementsQuickDialog({
  orderId,
  measureFields,
  initialValues,
  open,
  onOpenChange,
  userEmail,
}: {
  orderId: string;
  measureFields: string[];
  initialValues: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail?: string;
}) {
  const [values, setValues] = useState(initialValues);
  const [lang, setLang] = useState<MeasureLang>("en");
  const updateOrder = useUpdateOrder();

  async function save() {
    try {
      await updateOrder.mutateAsync({ id: orderId, patch: { measurements: compactMeasurements(values) }, userEmail });
      toast.success("Measurements saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save measurements");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setValues(initialValues);
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Measurements</DialogTitle>
          <DialogDescription>Only the measurements are updated — nothing else on this order changes.</DialogDescription>
        </DialogHeader>
        <MeasurementGrid fields={measureFields} values={values} onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))} lang={lang} onLangChange={setLang} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateOrder.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateOrder.isPending}>
            {updateOrder.isPending ? "Saving…" : "Save measurements"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
