"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_LEAD_TEMPLATES, LEAD_TEMPLATE_SETTING_KEY, MAX_LEAD_TEMPLATES, cleanTemplates, type LeadTemplate } from "@/lib/lead-templates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** The WhatsApp message starters offered on a lead ("Thanks for visiting", "Sending the quote"…). {name} and {product} are filled in per lead. */
export function LeadTemplatesSection() {
  const { data, isLoading, save } = useAppSetting<unknown>(LEAD_TEMPLATE_SETTING_KEY, DEFAULT_LEAD_TEMPLATES);
  const [draft, setDraft] = useState<LeadTemplate[] | null>(null);

  useSyncFromSource(data, (v) => {
    if (v && !draft) setDraft(cleanTemplates(v));
  });

  if (isLoading || !draft) return <Skeleton className="h-64 w-full" />;
  const rows = draft;

  const update = (i: number, patch: Partial<LeadTemplate>) => setDraft(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function onSave() {
    const cleaned = rows.filter((r) => r.label.trim() && r.text.trim());
    if (cleaned.length === 0) return toast.error("Keep at least one message, or use Reset to defaults");
    try {
      await save.mutateAsync(cleaned.map((r) => ({ ...r, label: r.label.trim(), text: r.text.trim() })));
      setDraft(cleaned);
      toast.success("Message templates saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead WhatsApp messages</CardTitle>
        <CardDescription>
          Shown under the WhatsApp button on a lead. Write <code className="rounded bg-muted px-1">{"{name}"}</code> for the person&apos;s first name and <code className="rounded bg-muted px-1">{"{product}"}</code> for what they asked about.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r, i) => (
          <div key={r.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label className="text-xs">Button name</Label>
                <Input value={r.label} maxLength={40} onChange={(e) => update(i, { label: e.target.value })} className="h-11" />
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={`Remove ${r.label || "message"}`} onClick={() => setDraft(rows.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Message</Label>
              <Textarea rows={3} value={r.text} maxLength={600} onChange={(e) => update(i, { text: e.target.value })} />
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-11" disabled={rows.length >= MAX_LEAD_TEMPLATES} onClick={() => setDraft([...rows, { id: `t${Date.now()}`, label: "", text: "" }])}>
            <Plus className="size-4" /> Add a message
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => setDraft(DEFAULT_LEAD_TEMPLATES)}>
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
