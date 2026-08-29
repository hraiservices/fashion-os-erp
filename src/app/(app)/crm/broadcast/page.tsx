"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";
import { useCustomerProfiles } from "@/hooks/use-customer-profiles";
import { useSendBroadcast, type BroadcastResult } from "@/hooks/use-whatsapp-broadcast";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MAX_MESSAGE_LENGTH = 900;

/** Sends one message to every customer carrying any of the selected tags. Segment mechanism is
 *  just the existing customer tags (VIP, At-Risk, ...) — nothing new to configure per broadcast
 *  beyond the shared template set up under Settings → WhatsApp. */
export default function BroadcastPage() {
  const { profiles, isLoading } = useCustomerProfiles();
  const sendBroadcast = useSendBroadcast();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [profiles]);

  const matching = useMemo(() => profiles.filter((c) => c.tags.some((t) => selectedTags.includes(t))), [profiles, selectedTags]);
  const eligible = matching.filter((c) => !c.whatsappOptOut);
  const optedOutCount = matching.length - eligible.length;

  function toggleTag(tag: string) {
    setSelectedTags((tags) => (tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]));
    setResult(null);
  }

  async function onConfirmSend() {
    setConfirmOpen(false);
    try {
      const res = await sendBroadcast.mutateAsync({ tags: selectedTags, message: message.trim() });
      setResult(res);
      toast.success(`Sent to ${res.sent} of ${res.total} customers`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Broadcast failed");
    }
  }

  if (isLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Broadcast"
        description="Message every customer with a chosen tag at once"
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/crm" />}>
            <ArrowLeft className="size-4" /> Back to Customers
          </Button>
        }
      />

      {allTags.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          No customer tags yet — add tags to customers in CRM first, then come back here to message them.
        </p>
      ) : (
        <div className="space-y-4 rounded-xl border bg-card p-5">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Segment (any customer with any of these tags)</Label>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedTags.includes(tag) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {selectedTags.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{eligible.length}</span> customer{eligible.length === 1 ? "" : "s"} will receive this
              {optedOutCount > 0 && <> · {optedOutCount} skipped (opted out of WhatsApp)</>}
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Message</Label>
            <Textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              placeholder="What do you want to tell them?"
            />
            <p className="text-right text-[11px] text-muted-foreground">{message.length}/{MAX_MESSAGE_LENGTH}</p>
          </div>

          <Button
            className="h-12 px-6 text-base sm:h-9 sm:text-sm"
            disabled={selectedTags.length === 0 || !message.trim() || eligible.length === 0 || sendBroadcast.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Send className="size-4" /> {sendBroadcast.isPending ? "Sending…" : `Send to ${eligible.length} customer${eligible.length === 1 ? "" : "s"}`}
          </Button>

          {result && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs">
              <Badge variant="outline" className="mb-1">Last send</Badge>
              <p>
                {result.sent} sent, {result.failed} failed, out of {result.total} eligible. Check Settings → WhatsApp&apos;s send log for details on any
                failures.
              </p>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {eligible.length} customer{eligible.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>This sends a real WhatsApp message right away and can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmSend}>Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
