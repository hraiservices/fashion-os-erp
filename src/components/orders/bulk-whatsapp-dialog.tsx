"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { buildWhatsAppUrl } from "@/lib/business-rules";
import { resolveWaType } from "@/lib/wa-type";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_STITCHING_WHATSAPP_TEMPLATES } from "@/lib/stitching-whatsapp";
import type { Order } from "@/lib/types";
import type { Shop } from "@/lib/settings";

/**
 * Bulk WhatsApp reminders — deliberately NOT an auto-loop of window.open() calls. Browser
 * popup blockers kill every tab after the first one opened outside a direct click handler, so
 * this instead lists every selected order with its own individual "Send" link — one real click
 * per recipient, same as sending them one at a time from the order list, just batched into one
 * place instead of hunting down each order.
 */
export function BulkWhatsAppDialog({
  orders,
  shop,
  open,
  onOpenChange,
  trackUrlByMobile,
}: {
  orders: Order[];
  shop?: Shop;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Customer mobile → their public order-status link, for the {track_link} WhatsApp variable. */
  trackUrlByMobile?: Map<string, string>;
}) {
  const { data: waTemplates } = useAppSetting("stitchingWhatsAppTemplates", DEFAULT_STITCHING_WHATSAPP_TEMPLATES);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send reminders ({orders.length})</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Each order gets its own message, tailored to whether it&apos;s still owed money or just ready for pickup. Click each to send.</p>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {orders.map((o) => {
            const type = o.balance > 0 ? "paymentDue" : resolveWaType(o);
            return (
              <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{o.name}</p>
                  <p className="text-xs text-muted-foreground">{o.id} · {o.mobile}</p>
                </div>
                <WhatsAppButton href={buildWhatsAppUrl({ ...o, trackUrl: trackUrlByMobile?.get(o.mobile) }, type, shop, waTemplates)} label="Send" size="sm" />
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
