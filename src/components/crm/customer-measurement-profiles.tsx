"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, Pencil, Archive, ArchiveRestore, Star } from "lucide-react";
import { useMeasureFields } from "@/hooks/use-measure-fields";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getProfiles, activeProfiles } from "@/lib/measurement-profiles";
import { MeasurementView } from "@/components/measurements/measurement-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/format";
import type { CustomerProfile } from "@/lib/crm";

async function patchProfile(mobile: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/customers/${mobile}/measurement-profiles`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/**
 * Lists all of a customer's saved measurement profiles side by side (not just whichever one an
 * order happened to load last) — see the "Sonia has two suits with different fits" scenario
 * this feature exists for. Only rendered when there's more than the one legacy fallback profile;
 * a customer who's never engaged with named profiles keeps seeing just the plain Measurements
 * card above, unchanged.
 */
export function CustomerMeasurementProfiles({ cust }: { cust: CustomerProfile }) {
  const { data: fields } = useMeasureFields();
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const measureFields = fields || [];
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const profiles = getProfiles({ measurements: cust.measurements, measurementProfiles: cust.measurementProfiles, createdAt: cust.createdAt });
  const visible = [...activeProfiles(profiles), ...profiles.filter((p) => p.archived)];

  // The legacy synthesized fallback (id "legacy") is exactly what the plain Measurements card
  // already shows — nothing gained by rendering a second, identical-looking list for it.
  if (profiles.length <= 1 && profiles[0]?.id === "legacy") return null;
  if (profiles.length === 0) return null;

  const canManage = !!user?.perms.editMeasurements;

  async function run(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      await patchProfile(cust.mobile, body);
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update that profile");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Layers className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Measurement profiles</h2>
      </div>
      <div className="divide-y">
        {visible.map((p) => (
          <div key={p.id} className={p.archived ? "p-4 opacity-60" : "p-4"}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              {renamingId === p.id ? (
                <div className="flex items-center gap-2">
                  <Input value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} className="h-8 w-48" />
                  <Button
                    size="sm"
                    disabled={busyId === p.id || !renameDraft.trim()}
                    onClick={async () => {
                      await run(p.id, { action: "rename", id: p.id, name: renameDraft.trim() });
                      setRenamingId(null);
                    }}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.isDefault && (
                    <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <Star className="size-2.5 fill-current" /> Usual
                    </span>
                  )}
                </div>
              )}
              {canManage && renamingId !== p.id && (
                <div className="flex items-center gap-1">
                  {!p.archived && !p.isDefault && (
                    <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => run(p.id, { action: "setDefault", id: p.id })}>
                      <Star className="size-3.5" /> Make usual
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRenamingId(p.id);
                      setRenameDraft(p.name);
                    }}
                  >
                    <Pencil className="size-3.5" /> Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === p.id}
                    onClick={() => run(p.id, { action: "archive", id: p.id, archived: !p.archived })}
                  >
                    {p.archived ? (
                      <>
                        <ArchiveRestore className="size-3.5" /> Restore
                      </>
                    ) : (
                      <>
                        <Archive className="size-3.5" /> Archive
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
            <p className="mb-2 text-xs text-muted-foreground">Updated {fmtDate(p.updatedAt)}</p>
            <MeasurementView fields={measureFields} values={p.values} />
          </div>
        ))}
      </div>
    </section>
  );
}
