"use client";

import { useAppSetting } from "@/hooks/use-app-setting";

export interface ShopConfig {
  name: string;
  phone: string;
  address: string;
  gstin: string;
  logoDataUrl: string | null;
}

export const DEFAULT_SHOP_CONFIG: ShopConfig = { name: "", phone: "", address: "", gstin: "", logoDataUrl: null };

export function useShopSettings() {
  return useAppSetting<ShopConfig>("shop", DEFAULT_SHOP_CONFIG);
}
