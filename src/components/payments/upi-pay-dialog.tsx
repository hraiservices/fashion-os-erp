"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, QrCode, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { useAppSetting } from "@/hooks/use-app-setting";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { inr } from "@/lib/format";
import { DEFAULT_SHOP_LINKS, SHOP_LINKS_KEY, buildUpiLink, isValidUpiId, type ShopLinks } from "@/lib/shop-links";

/** Shows a UPI QR for the amount due (the customer scans it at the counter) and a UPI link/ID they can be sent. Staff still mark the payment received themselves. */
export function UpiPayButton({ amount, note, name, mobile, className }: { amount: number; note: string; name: string; mobile?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" className={className} onClick={() => setOpen(true)}>
        <QrCode className="size-4 shrink-0" /> <span className="truncate">UPI QR</span>
      </Button>
      <UpiPayDialog open={open} onOpenChange={setOpen} amount={amount} note={note} name={name} mobile={mobile} />
    </>
  );
}

export function UpiPayDialog({ open, onOpenChange, amount, note, name, mobile }: { open: boolean; onOpenChange: (o: boolean) => void; amount: number; note: string; name: string; mobile?: string }) {
  const { data: links = DEFAULT_SHOP_LINKS } = useAppSetting<ShopLinks>(SHOP_LINKS_KEY, DEFAULT_SHOP_LINKS);
  const ready = isValidUpiId(links.upiId);
  const link = ready ? buildUpiLink(links, amount, note) : "";
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (!open || !link) return;
    let alive = true;
    QRCode.toDataURL(link, { margin: 1, width: 360 }).then((url) => alive && setQr(url), () => alive && setQr(""));
    return () => {
      alive = false;
    };
  }, [open, link]);

  const message = `Hi ${name.split(" ")[0] || "there"}, ${inr(amount)} is due for ${note}. You can pay by UPI to ${links.upiId}${links.upiName ? ` (${links.upiName})` : ""}. Please share the screenshot once done. Thank you! 🙏`;
  const waHref = mobile ? `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(message)}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pay {inr(amount)} by UPI</DialogTitle>
          <DialogDescription>{note}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-6 text-center">
          {!ready ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Add your shop&apos;s UPI ID first in <Link href="/settings/shop-links" className="font-medium underline">Settings → UPI Payments</Link>.
            </p>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
              {qr ? <img src={qr} alt={`UPI QR for ${inr(amount)}`} className="mx-auto size-60 rounded-lg border bg-white p-2" /> : <div className="mx-auto size-60 animate-pulse rounded-lg bg-muted" />}
              <p className="text-sm text-muted-foreground">Scan with any UPI app. Check the payment arrived before marking it paid.</p>
              <div className="flex flex-col gap-2">
                <Button type="button" className="h-12" nativeButton={false} render={<a href={link} />}>
                  <Smartphone className="size-4" /> Open in a UPI app (this phone)
                </Button>
                <Button type="button" variant="outline" className="h-12" onClick={() => navigator.clipboard?.writeText(links.upiId).then(() => toast.success("UPI ID copied"), () => toast.error("Couldn't copy"))}>
                  <Copy className="size-4" /> Copy UPI ID ({links.upiId})
                </Button>
                {waHref && <WhatsAppButton href={waHref} label="Send payment details on WhatsApp" className="h-12 w-full justify-center" />}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
