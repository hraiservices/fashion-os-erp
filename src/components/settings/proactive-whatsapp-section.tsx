"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { useWhatsAppCloudApiConfig } from "@/hooks/use-whatsapp-cloud-api";
import { useSyncFromSource } from "@/hooks/use-synced-state";
import type { WhatsAppCloudApiConfig } from "@/lib/whatsapp-cloud-api";
import { WhatsAppTemplateField } from "@/components/settings/whatsapp-template-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const DEFAULT_MIN_DAYS_OVERDUE = 3;
const DEFAULT_COOLDOWN_DAYS = 7;

const BLANK_CLOUD_API: WhatsAppCloudApiConfig = { phoneNumberId: "", accessToken: "", templateName: "", languageCode: "en_US" };

/** Config for the two proactive (shop-initiated) WhatsApp sends: the daily AI briefing (already
 *  generated every morning by the /api/ai/daily-briefing cron, shown in-app via the
 *  notification bell) pushed to a list of staff numbers, and a "ready for pickup" nudge sent
 *  automatically to a customer when their order reaches Ready (src/app/api/orders/[id]/
 *  advance-stage). Both need their own approved Meta template each — a shop-initiated message
 *  can't use freeform text the way the order-status concierge's replies can. */
export function ProactiveWhatsAppSection() {
  const { data: recipients, isLoading: recipientsLoading, save: saveRecipients } = useAppSetting<string[]>("dailyBriefingRecipients", []);
  const { data: cloudApi, isLoading: cloudApiLoading, save: saveCloudApi } = useWhatsAppCloudApiConfig(BLANK_CLOUD_API);
  const { data: minDaysOverdue, isLoading: minDaysLoading, save: saveMinDays } = useAppSetting<number>("paymentReminderMinDaysOverdue", DEFAULT_MIN_DAYS_OVERDUE);
  const { data: reminderCooldown, isLoading: reminderCooldownLoading, save: saveReminderCooldown } = useAppSetting<number>(
    "paymentReminderCooldownDays",
    DEFAULT_COOLDOWN_DAYS
  );

  const [list, setList] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [readyTemplateName, setReadyTemplateName] = useState("");
  const [paymentReminderTemplateName, setPaymentReminderTemplateName] = useState("");
  const [broadcastTemplateName, setBroadcastTemplateName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [draftMinDays, setDraftMinDays] = useState(DEFAULT_MIN_DAYS_OVERDUE);
  const [draftCooldown, setDraftCooldown] = useState(DEFAULT_COOLDOWN_DAYS);

  useSyncFromSource(recipients, (r) => {
    if (r) setList(r);
  });
  useSyncFromSource(cloudApi, (c) => {
    if (c) {
      setTemplateName(c.briefingTemplateName || "");
      setReadyTemplateName(c.readyTemplateName || "");
      setPaymentReminderTemplateName(c.paymentReminderTemplateName || "");
      setBroadcastTemplateName(c.broadcastTemplateName || "");
    }
  });
  const templatesEnabled = !!cloudApi?.wabaId && !!cloudApi?.accessToken;
  useSyncFromSource(minDaysOverdue, (d) => {
    if (d != null) setDraftMinDays(d);
  });
  useSyncFromSource(reminderCooldown, (d) => {
    if (d != null) setDraftCooldown(d);
  });

  async function commitRecipients(next: string[], message: string) {
    try {
      await saveRecipients.mutateAsync(next);
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  function addRecipient() {
    const mobile = newMobile.trim();
    if (!/^\d{10}$/.test(mobile)) {
      toast.error("Enter a 10-digit mobile number");
      return;
    }
    if (list.includes(mobile)) {
      toast.error("Already on the list");
      return;
    }
    setNewMobile("");
    commitRecipients([...list, mobile], "Recipient added");
  }

  async function saveTemplateName() {
    try {
      await saveCloudApi.mutateAsync({ ...(cloudApi || BLANK_CLOUD_API), briefingTemplateName: templateName });
      toast.success("Template name saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function saveReadyTemplateName() {
    try {
      await saveCloudApi.mutateAsync({ ...(cloudApi || BLANK_CLOUD_API), readyTemplateName });
      toast.success("Template name saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function savePaymentReminderSettings() {
    try {
      await Promise.all([
        saveCloudApi.mutateAsync({ ...(cloudApi || BLANK_CLOUD_API), paymentReminderTemplateName }),
        saveMinDays.mutateAsync(draftMinDays),
        saveReminderCooldown.mutateAsync(draftCooldown),
      ]);
      toast.success("Payment reminder settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function saveBroadcastTemplateName() {
    try {
      await saveCloudApi.mutateAsync({ ...(cloudApi || BLANK_CLOUD_API), broadcastTemplateName });
      toast.success("Template name saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  if (recipientsLoading || cloudApiLoading || minDaysLoading || reminderCooldownLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Daily briefing on WhatsApp</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Sends the same daily briefing already shown in-app (dashboard notification bell) to these WhatsApp numbers each morning. Requires the Phone
          Number ID/Access Token under Product Recommendations above, plus a separate Meta-approved template with exactly one body parameter (the
          briefing text).
        </p>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Approved briefing template name</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <WhatsAppTemplateField value={templateName} onChange={setTemplateName} expectedParamCount={1} templatesEnabled={templatesEnabled} placeholder="e.g. daily_briefing" />
            </div>
            <Button variant="outline" onClick={saveTemplateName} disabled={saveCloudApi.isPending}>
              Save
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Recipients ({list.length})</Label>
          <div className="flex gap-2">
            <Input
              value={newMobile}
              onChange={(e) => setNewMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              onKeyDown={(e) => e.key === "Enter" && addRecipient()}
              inputMode="numeric"
              placeholder="10-digit mobile number"
              aria-label="New recipient mobile number"
            />
            <Button onClick={addRecipient} disabled={saveRecipients.isPending || !newMobile.trim()}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
          {list.length === 0 ? (
            <p className="rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">No recipients yet.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-lg border">
              {list.map((mobile, i) => (
                <li key={mobile} className="flex items-center gap-2 px-3 py-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums">{mobile}</p>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-8"
                    aria-label={`Remove ${mobile}`}
                    disabled={saveRecipients.isPending}
                    onClick={() => commitRecipients(list.filter((_, idx) => idx !== i), `${mobile} removed`)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-sm">&quot;Ready for pickup&quot; WhatsApp nudge</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Sends the customer a WhatsApp message the moment their order reaches Ready — no recipient list needed, it goes to that order&apos;s own
          customer. Needs a separate Meta-approved template with exactly 3 body parameters, in order: customer name, order id, balance due.
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Approved template name</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <WhatsAppTemplateField
                value={readyTemplateName}
                onChange={setReadyTemplateName}
                expectedParamCount={3}
                templatesEnabled={templatesEnabled}
                placeholder="e.g. order_ready_for_pickup"
              />
            </div>
            <Button variant="outline" onClick={saveReadyTemplateName} disabled={saveCloudApi.isPending}>
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Payment reminder automation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Auto-sends the same balance-due reminder the Customer Balances report&apos;s manual WhatsApp button already builds, once a stitching order or
          sales invoice is overdue by at least this many days. Checks &quot;Don&apos;t WhatsApp this customer&quot; and won&apos;t remind the same
          customer twice within the cooldown window. Needs a separate Meta-approved template with exactly 2 body parameters, in order: customer name,
          amount due.
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Approved template name</Label>
          <WhatsAppTemplateField
            value={paymentReminderTemplateName}
            onChange={setPaymentReminderTemplateName}
            expectedParamCount={2}
            templatesEnabled={templatesEnabled}
            placeholder="e.g. payment_reminder"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Min days overdue</Label>
            <NumberInput min={1} value={draftMinDays} onChange={setDraftMinDays} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Cooldown (days)</Label>
            <NumberInput min={1} value={draftCooldown} onChange={setDraftCooldown} />
          </div>
        </div>
        <Button variant="outline" onClick={savePaymentReminderSettings} disabled={saveCloudApi.isPending || saveMinDays.isPending || saveReminderCooldown.isPending}>
          Save
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Broadcast messages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Lets you message every customer with a chosen tag at once from CRM → Broadcast — checks &quot;Don&apos;t WhatsApp this customer&quot; for
          each one. Needs a separate Meta-approved template with exactly 2 body parameters, in order: customer name, message text.
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Approved template name</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <WhatsAppTemplateField
                value={broadcastTemplateName}
                onChange={setBroadcastTemplateName}
                expectedParamCount={2}
                templatesEnabled={templatesEnabled}
                placeholder="e.g. broadcast_message"
              />
            </div>
            <Button variant="outline" onClick={saveBroadcastTemplateName} disabled={saveCloudApi.isPending}>
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
}
