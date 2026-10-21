"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { useQueryClient } from "@tanstack/react-query";
import { cleanLeadTypes, DEFAULT_LEAD_TYPES, LEAD_TYPE_SETTING_KEY, MAX_LEAD_TYPES } from "@/lib/lead-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** The categories offered on a lead ("Stitching Customer", "App Sale (Fashion Flow)"…) — one
 *  per lead, used to sort and filter leads that aren't all the same kind of sale. Editable here
 *  so a shop can add a new business line themselves without needing a code change. */
export function LeadTypesSection() {
  const qc = useQueryClient();
  const { data, isLoading, save } = useAppSetting<unknown>(LEAD_TYPE_SETTING_KEY, DEFAULT_LEAD_TYPES);
  const [draft, setDraft] = useState<string[] | null>(null);

  useSyncFromSource(data, (v) => {
    if (v && !draft) setDraft(cleanLeadTypes(v));
  });

  if (isLoading || !draft) return <Skeleton className="h-48 w-full" />;
  const rows = draft;

  async function onSave() {
    const nonEmpty = rows.map((r) => r.trim()).filter(Boolean);
    if (nonEmpty.length === 0) return toast.error("Keep at least one type, or use Reset to defaults");
    const cleaned = cleanLeadTypes(nonEmpty);
    try {
      await save.mutateAsync(cleaned);
      setDraft(cleaned);
      qc.invalidateQueries({ queryKey: ["targets", "meta"] });
      toast.success("Lead types saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead types</CardTitle>
        <CardDescription>
          What a lead is for, beyond a regular stitching customer — a sale of the Fashion Flow app itself, a referral, a wholesale enquiry, or anything else worth sorting separately.
          Shown on the New Lead form, the Leads list filter, and the Targets reports. Renaming one here changes it everywhere it&rsquo;s used; removing one leaves any lead already set to it unchanged, just no longer offered for new leads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={r} maxLength={40} onChange={(e) => setDraft(rows.map((v, j) => (j === i ? e.target.value : v)))} className="h-11" placeholder="e.g. Wholesale / Bulk" />
            <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={`Remove ${r || "this type"}`} onClick={() => setDraft(rows.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-11" disabled={rows.length >= MAX_LEAD_TYPES} onClick={() => setDraft([...rows, ""])}>
            <Plus className="size-4" /> Add a type
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => setDraft(DEFAULT_LEAD_TYPES)}>
            <RotateCcw className="size-4" /> Reset to defaults
          </Button>
        </div>
        <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" disabled={save.isPending} onClick={onSave}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
