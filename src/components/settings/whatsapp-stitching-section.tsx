"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import {
  DEFAULT_STITCHING_WHATSAPP_TEMPLATES,
  STITCHING_WHATSAPP_LABELS,
  STITCHING_WHATSAPP_VARIABLES,
  type StitchingWhatsAppTemplates,
} from "@/lib/stitching-whatsapp";
import type { WhatsAppMessageType } from "@/lib/business-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const TYPES: WhatsAppMessageType[] = ["received", "ready", "overdue", "delivered", "payment", "paymentDue"];

export function WhatsAppStitchingSection() {
  const { data, isLoading, save } = useAppSetting<StitchingWhatsAppTemplates>("stitchingWhatsAppTemplates", DEFAULT_STITCHING_WHATSAPP_TEMPLATES);
  const [templates, setTemplates] = useState<StitchingWhatsAppTemplates>(DEFAULT_STITCHING_WHATSAPP_TEMPLATES);

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
        <CardTitle className="text-sm">Stitching order WhatsApp templates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {STITCHING_WHATSAPP_VARIABLES.map((v) => (
            <Badge key={v} variant="secondary" className="font-mono">
              {v}
            </Badge>
          ))}
        </div>

        {TYPES.map((type) => (
          <div key={type} className="space-y-1.5">
            <Label className="text-xs font-medium">{STITCHING_WHATSAPP_LABELS[type]}</Label>
            <Textarea
              rows={4}
              className="font-mono text-xs"
              value={templates[type]}
              onChange={(e) => setTemplates({ ...templates, [type]: e.target.value })}
            />
          </div>
        ))}

        <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" disabled={save.isPending} onClick={onSave}>
          {save.isPending ? "Saving…" : "Save templates"}
        </Button>
      </CardContent>
    </Card>
  );
}
