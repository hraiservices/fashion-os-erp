"use client";

import { useAppSetting } from "@/hooks/use-app-setting";
import { DEF_MF_LABELS } from "@/lib/measurements";

/**
 * Shop-wide measurement field list, stored in app_settings under "measureFields"
 * (matching the old app's sw_mfields_v5 / syncSettings("measureFields", …) key).
 */
export function useMeasureFields() {
  return useAppSetting<string[]>("measureFields", [...DEF_MF_LABELS]);
}
