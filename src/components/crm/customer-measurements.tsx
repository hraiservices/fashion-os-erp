"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Ruler, Pencil, X } from "lucide-react";
import { useMeasureFields } from "@/hooks/use-measure-fields";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSaveCustomer } from "@/hooks/use-customer-mutations";
import { hydrateMeasurements, compactMeasurements, type MeasureLang } from "@/lib/measurements";
import { MeasurementGrid, MeasurementView } from "@/components/measurements/measurement-grid";
import { Button } from "@/components/ui/button";
import type { CustomerProfile } from "@/lib/crm";

/**
 * The customer's saved measurements — this is the record OrderForm prefills from, so
 * editing it here is what keeps future orders correct.
 */
export function CustomerMeasurements({ cust }: { cust: CustomerProfile }) {
  const { data: fields } = useMeasureFields();
  const { data: user } = useCurrentUser();
  const saveCustomer = useSaveCustomer();
  const measureFields = fields || [];

  const [editing, setEditing] = useState(false);
  const [lang, setLang] = useState<MeasureLang>("en");
  const [draft, setDraft] = useState<Record<string, string>>({});

  const saved = hydrateMeasurements(measureFields, cust.measurements as Record<string, unknown> | null);

  function startEdit() {
    setDraft(saved);
    setEditing(true);
  }

  async function save() {
    try {
      // notes/name are re-sent unchanged: useSaveCustomer upserts the whole row, and
      // omitting them would blank them out. Loyalty fields are untouched by that hook.
      await saveCustomer.mutateAsync({
        name: cust.name,
        mobile: cust.mobile,
        originalMobile: cust.mobile,
        notes: cust.notes || "",
        measurements: compactMeasurements(draft),
        userEmail: user?.email,
      });
      setEditing(false);
      toast.success("Measurements saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save measurements");
    }
  }

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Ruler className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Measurements</h2>
        {user?.perms.editMeasurements && (
          <div className="ml-auto">
            {editing ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                <X className="size-3.5" /> Cancel
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="size-3.5" /> Edit
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        {editing ? (
          <>
            <MeasurementGrid
              fields={measureFields}
              values={draft}
              onChange={(k, v) => setDraft((d) => ({ ...d, [k]: v }))}
              lang={lang}
              onLangChange={setLang}
            />
            <Button className="w-full sm:w-auto" disabled={saveCustomer.isPending} onClick={save}>
              {saveCustomer.isPending ? "Saving…" : "Save measurements"}
            </Button>
          </>
        ) : (
          <MeasurementView fields={measureFields} values={saved} />
        )}
      </div>
    </section>
  );
}
