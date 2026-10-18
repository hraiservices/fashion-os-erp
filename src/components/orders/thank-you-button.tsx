"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAiOn, useThankYou } from "@/hooks/use-ai";
import { normalizeIndianMobile } from "@/lib/business-rules";

/** After delivery: AI writes a warm, personal thank-you (with the review link when the shop has one). Staff read it, edit it, and send it on WhatsApp. */
export function ThankYouButton({ orderId, name, mobile, className }: { orderId: string; name: string; mobile: string; className?: string }) {
  const on = useAiOn("thanks");
  const draft = useThankYou();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!on) return null;

  function start() {
    setOpen(true);
    if (!text) write();
  }
  function write() {
    draft.mutate(orderId, { onSuccess: (r) => setText(r.text), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't write the message") });
  }

  return (
    <>
      <Button type="button" variant="outline" className={className} onClick={start}>
        <Sparkles className="size-4 shrink-0" /> <span className="min-w-0 truncate">Thank-you</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thank {name.trim().split(/\s+/)[0] || "the customer"}</DialogTitle>
            <DialogDescription>Written by AI — read it, change anything, then send.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-6">
            {draft.isPending && !text ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Writing…
              </p>
            ) : (
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="text-base" aria-label="Thank-you message" />
            )}
            <div className="flex flex-col gap-2">
              <a
                href={text ? `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(text)}` : undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!text}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-base font-medium text-white aria-disabled:pointer-events-none aria-disabled:opacity-50"
              >
                <MessageCircle className="size-4" /> Send on WhatsApp
              </a>
              <Button type="button" variant="outline" className="h-12" disabled={draft.isPending} onClick={write}>
                {draft.isPending && <Loader2 className="size-4 animate-spin" />} Write another
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
