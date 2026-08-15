"use client";

import { useAppSetting } from "@/hooks/use-app-setting";

export interface ShopConfig {
  name: string;
  phone: string;
  address: string;
  gstin: string;
  logoDataUrl: string | null;
  /** Shown as "Shop Online: <url>" in WhatsApp messages when set. Optional — omit to skip the line. */
  websiteUrl: string;
  /** Google review link shown in the "delivered" WhatsApp message when set. */
  reviewUrl: string;
}

export const DEFAULT_SHOP_CONFIG: ShopConfig = { name: "", phone: "", address: "", gstin: "", logoDataUrl: null, websiteUrl: "", reviewUrl: "" };

export function useShopSettings() {
  return useAppSetting<ShopConfig>("shop", DEFAULT_SHOP_CONFIG);
}
