"use client";

import { useAppSetting } from "@/hooks/use-app-setting";

export interface ShopConfig {
  name: string;
  phone: string;
  address: string;
  gstin: string;
  /** Despite the name, a public Storage URL since the branding-media migration (see
   *  src/lib/supabase/branding-storage.ts) — a legacy, not-yet-resaved shop may still have a raw
   *  base64 `data:` URL here, which every consumer renders identically (`<img src>` and
   *  react-pdf's `<Image src>` both accept either). */
  logoDataUrl: string | null;
  /** Browser tab icon — separate from logoDataUrl since a favicon usually wants a simpler,
   *  square-cropped mark rather than the full logo shown on the dashboard/invoices. Falls back
   *  to logoDataUrl, then the default scissors icon, when unset — see /api/branding/icon. Same
   *  "URL despite the name, may still be a legacy data: URL" note as logoDataUrl above. */
  faviconDataUrl: string | null;
  /** Shown as "Shop Online: <url>" in WhatsApp messages when set. Optional — omit to skip the line. */
  websiteUrl: string;
  /** Google review link shown in the "delivered" WhatsApp message when set. */
  reviewUrl: string;
  /** Thermal receipt paper width (src/lib/thermal-receipt.ts) — must match the physical roll in
   *  the connected receipt/label printer (e.g. Everycom's 58mm models vs. 80mm POS-counter
   *  printers), or the printed receipt is truncated/oversized relative to the actual paper. */
  receiptPaperWidthMm: 58 | 80;
  /** Open/close time (24h "HH:MM", IST) and closed weekdays (0=Sunday..6=Saturday) — used to
   *  compute business-hours-aware durations (Reports → Stage Change Speed) instead of raw
   *  wall-clock time, so an order sitting idle overnight or on a closed day doesn't inflate "how
   *  long did this really take." See src/lib/business-hours.ts. */
  businessOpenTime: string;
  businessCloseTime: string;
  businessClosedWeekdays: number[];
}

export const DEFAULT_SHOP_CONFIG: ShopConfig = {
  name: "",
  phone: "",
  address: "",
  gstin: "",
  logoDataUrl: null,
  faviconDataUrl: null,
  websiteUrl: "",
  reviewUrl: "",
  receiptPaperWidthMm: 80,
  businessOpenTime: "10:30",
  businessCloseTime: "20:00",
  businessClosedWeekdays: [0],
};

export function useShopSettings() {
  return useAppSetting<ShopConfig>("shop", DEFAULT_SHOP_CONFIG);
}
