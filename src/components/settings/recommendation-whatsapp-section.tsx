"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useWhatsAppCloudApiConfig } from "@/hooks/use-whatsapp-cloud-api";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import { DEFAULT_RECOMMENDATION_TEMPLATE, RECOMMENDATION_TEMPLATE_VARIABLES } from "@/lib/recommendation-whatsapp";
import type { WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const DEFAULT_COOLDOWN_DAYS = 14;
const BLANK_CLOUD_API: WhatsAppCloudApiConfig = { phoneNumberId: "", accessToken: "", templateName: "", languageCode: "en_US" };

/** Settings for Customer Purchase Intelligence's product-recommendation messages (Phase 6). */
export function RecommendationWhatsAppSection() {
  const { data: template, isLoading: templateLoading, save: saveTemplate } = useAppSetting<string>("recommendationWhatsAppTemplate", DEFAULT_RECOMMENDATION_TEMPLATE);
  const { data: cooldown, isLoading: cooldownLoading, save: saveCooldown } = useAppSetting<number>("recommendationCooldownDays", DEFAULT_COOLDOWN_DAYS);
  const { data: cloudApi, isLoading: cloudApiLoading, save: saveCloudApi } = useWhatsAppCloudApiConfig(BLANK_CLOUD_API);

  const [draftTemplate, setDraftTemplate] = useState(DEFAULT_RECOMMENDATION_TEMPLATE);
  const [draftCooldown, setDraftCooldown] = useState(DEFAULT_COOLDOWN_DAYS);
  const [draftCloudApi, setDraftCloudApi] = useState<WhatsAppCloudApiConfig>(BLANK_CLOUD_API);

  useSyncFromSource(template, (t) => {
    if (t) setDraftTemplate(t);
  });
  useSyncFromSource(cooldown, (c) => {
    if (c != null) setDraftCooldown(c);
  });
  useSyncFromSource(cloudApi, (c) => {
    if (c) setDraftCloudApi(c);
  });

  async function onSave() {
    try {
      await Promise.all([saveTemplate.mutateAsync(draftTemplate), saveCooldown.mutateAsync(draftCooldown), saveCloudApi.mutateAsync(draftCloudApi)]);
      toast.success("Recommendation settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (templateLoading || cooldownLoading || cloudApiLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Product recommendation messages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Used when sending a &quot;customers who might want this&quot; message from a product&apos;s edit page or a customer&apos;s profile.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {RECOMMENDATION_TEMPLATE_VARIABLES.map((v) => (
            <Badge key={v} variant="secondary" className="font-mono">{v}</Badge>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Message template</Label>
          <Textarea rows={5} className="font-mono text-xs" value={draftTemplate} onChange={(e) => setDraftTemplate(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Cooldown (days)</Label>
          <p className="text-[11px] text-muted-foreground">Don&apos;t let the same product be re-suggested to the same customer within this many days.</p>
          <NumberInput min={0} className="h-9 w-32" value={draftCooldown} onChange={setDraftCooldown} />
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <p className="text-xs font-medium">WhatsApp Business Cloud API (optional)</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Leave blank to use the free &quot;open WhatsApp with message pre-filled&quot; flow above. Filling this in sends
              automatically instead — but requires your own Meta Business Account, a phone number registered with
              WhatsApp Business, and a message template approved by Meta with exactly 3 body parameters, in order:
              customer name, product name, price. Get these from Meta Business Manager → WhatsApp Manager.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phone Number ID</Label>
              <Input value={draftCloudApi.phoneNumberId} onChange={(e) => setDraftCloudApi({ ...draftCloudApi, phoneNumberId: e.target.value })} placeholder="e.g. 109876543210123" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Access Token</Label>
              <Input type="password" value={draftCloudApi.accessToken} onChange={(e) => setDraftCloudApi({ ...draftCloudApi, accessToken: e.target.value })} placeholder="System user access token" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Approved Template Name</Label>
              <Input value={draftCloudApi.templateName} onChange={(e) => setDraftCloudApi({ ...draftCloudApi, templateName: e.target.value })} placeholder="e.g. product_recommendation" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Template Language Code</Label>
              <Input value={draftCloudApi.languageCode} onChange={(e) => setDraftCloudApi({ ...draftCloudApi, languageCode: e.target.value })} placeholder="e.g. en_US" />
            </div>
          </div>
        </div>

        <Button className="h-12 px-6 text-base sm:h-8 sm:px-2.5 sm:text-sm" disabled={saveTemplate.isPending || saveCooldown.isPending || saveCloudApi.isPending} onClick={onSave}>
          {saveTemplate.isPending || saveCooldown.isPending || saveCloudApi.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
