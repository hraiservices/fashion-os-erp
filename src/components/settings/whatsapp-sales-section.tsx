"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_SALES_WHATSAPP_TEMPLATES, SALES_WHATSAPP_LABELS, SALES_WHATSAPP_VARIABLES, type SalesWhatsAppTemplates, type SalesWhatsAppType } from "@/lib/sales-whatsapp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const TYPES: SalesWhatsAppType[] = ["invoiceSent", "paymentReminder", "paymentReceived", "sendPdfLink"];

/** Unlike stitching-order WhatsApp templates (hardcoded), Sales templates are editable per business decision. */
export function WhatsAppSalesSection() {
  const { data, isLoading, save } = useAppSetting<SalesWhatsAppTemplates>("salesWhatsAppTemplates", DEFAULT_SALES_WHATSAPP_TEMPLATES);
  const [templates, setTemplates] = useState<SalesWhatsAppTemplates>(DEFAULT_SALES_WHATSAPP_TEMPLATES);

  useSyncFromSource(data, (d) => {
    if (d) setTemplates(d);
  });

  async function onSave() {
    try {
      await save.mutateAsync(templates);
      toast.success("WhatsApp templates saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Sales WhatsApp templates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {SALES_WHATSAPP_VARIABLES.map((v) => (
            <Badge key={v} variant="secondary" className="font-mono">
              {v}
            </Badge>
          ))}
        </div>

        {TYPES.map((type) => (
          <div key={type} className="space-y-1.5">
            <Label className="text-xs font-medium">{SALES_WHATSAPP_LABELS[type]}</Label>
            <Textarea
              rows={4}
              className="font-mono text-xs"
              value={templates[type]}
              onChange={(e) => setTemplates({ ...templates, [type]: e.target.value })}
            />
          </div>
        ))}

        <Button disabled={save.isPending} onClick={onSave}>
          {save.isPending ? "Saving…" : "Save templates"}
        </Button>
      </CardContent>
    </Card>
  );
}
