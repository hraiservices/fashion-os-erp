"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Hash, FileText, Shirt } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_DOCUMENT_NUMBERING, previewDocNumber, INVALID_SEPARATOR, type DocumentNumberingSettings, type DocNumberFormat } from "@/lib/document-numbering";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function FormatEditor({
  icon: Icon,
  title,
  fmt,
  onChange,
  docTypeLabel,
}: {
  icon: React.ElementType;
  title: string;
  fmt: DocNumberFormat;
  onChange: (fmt: DocNumberFormat) => void;
  docTypeLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Icon className="size-4" /> {title}
          </span>
          <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <input type="checkbox" className="size-4 rounded" checked={fmt.enabled} onChange={(e) => onChange({ ...fmt, enabled: e.target.checked })} />
            Use custom numbering
          </label>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!fmt.enabled ? (
          <p className="text-xs text-muted-foreground">
            Off — {docTypeLabel} numbers are generated automatically in the existing format. Turn this on to control the exact numbering yourself.
          </p>
        ) : (
          <>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Next number will look like</p>
              <p className="mt-0.5 font-mono text-lg font-semibold">{previewDocNumber(fmt)}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Prefix</Label>
                <Input className="h-10" value={fmt.prefix} onChange={(e) => onChange({ ...fmt, prefix: e.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Separator</Label>
                <Input
                  className="h-10"
                  maxLength={1}
                  value={fmt.separator}
                  onChange={(e) => {
                    const v = e.target.value;
                    // "/" becomes part of the actual order/invoice id, which is used as a URL
                    // segment — allowing it here silently breaks that document's own page.
                    if (v === INVALID_SEPARATOR) return;
                    onChange({ ...fmt, separator: v || "-" });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Digits</Label>
                <NumberInput min={1} max={8} className="h-10" value={fmt.padding} onChange={(v) => onChange({ ...fmt, padding: v || 4 })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Starts at</Label>
                <NumberInput min={1} className="h-10" value={fmt.startNumber} onChange={(v) => onChange({ ...fmt, startNumber: v || 1 })} />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" className="size-4 rounded" checked={fmt.includeYear} onChange={(e) => onChange({ ...fmt, includeYear: e.target.checked })} />
                Include the year in the number
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" className="size-4 rounded" checked={fmt.resetYearly} onChange={(e) => onChange({ ...fmt, resetYearly: e.target.checked })} />
                Restart from &quot;starts at&quot; every calendar year
              </label>
            </div>
            {!fmt.resetYearly && (
              <p className="text-[11px] text-muted-foreground">
                One continuous sequence forever — {docTypeLabel} numbers will keep climbing year after year instead of resetting each January.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              &quot;Starts at&quot; only matters the very first {docTypeLabel.toLowerCase()} created after turning this on — use it to continue from where your old numbering left off (e.g. 501 instead of 1). Every one after that just counts up by 1.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function DocumentNumberingSection() {
  const { data, isLoading, save } = useAppSetting<DocumentNumberingSettings>("documentNumbering", DEFAULT_DOCUMENT_NUMBERING);
  const [draft, setDraft] = useState<DocumentNumberingSettings>(DEFAULT_DOCUMENT_NUMBERING);

  useSyncFromSource(data, (d) => {
    if (d) setDraft(d);
  });

  async function handleSave() {
    try {
      await save.mutateAsync(draft);
      toast.success("Numbering settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Hash className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Numbers are assigned by the server the moment an invoice or order is created — never reused, never skipped by two people saving at the same time.
          Changing these settings only affects numbers issued <em>after</em> you save — nothing already created is renumbered.
        </p>
      </div>

      <FormatEditor icon={FileText} title="Invoices" docTypeLabel="Invoice" fmt={draft.invoice} onChange={(fmt) => setDraft({ ...draft, invoice: fmt })} />
      <FormatEditor icon={Shirt} title="Stitching Orders" docTypeLabel="Order" fmt={draft.stitchingOrder} onChange={(fmt) => setDraft({ ...draft, stitchingOrder: fmt })} />

      <Button onClick={handleSave} disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
