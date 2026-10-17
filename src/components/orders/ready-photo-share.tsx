"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSetting } from "@/hooks/use-app-setting";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { DEFAULT_SHOP_LINKS, SHOP_LINKS_KEY, isValidUpiId, type ShopLinks } from "@/lib/shop-links";

/**
 * "Your outfit is ready" with a photo of it. Take or pick a photo, then the phone's share sheet opens with the photo and
 * message ready — choose the customer's WhatsApp chat. (wa.me links can't carry a photo, so this uses the share sheet; on a
 * browser without file sharing it opens WhatsApp with the text only.)
 */
export function ReadyPhotoShare({ mobile, message, balance, className }: { mobile: string; message: string; balance: number; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { data: links = DEFAULT_SHOP_LINKS } = useAppSetting<ShopLinks>(SHOP_LINKS_KEY, DEFAULT_SHOP_LINKS);
  const text = balance > 0 && isValidUpiId(links.upiId) ? `${message}\n\nYou can pay the balance by UPI to ${links.upiId}${links.upiName ? ` (${links.upiName})` : ""}.` : message;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else {
        window.open(`https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        toast.info("This browser can't attach the photo — attach it in the WhatsApp chat that just opened.");
      }
    } catch (err) {
      // Closing the share sheet is not an error.
      if (!(err instanceof DOMException && err.name === "AbortError")) toast.error("Couldn't open sharing");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
      <Button type="button" variant="outline" className={className} disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} <span className="min-w-0 truncate">Send photo</span>
      </Button>
    </>
  );
}
