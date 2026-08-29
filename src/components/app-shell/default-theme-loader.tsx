"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_THEME_MODE } from "@/components/settings/theme-mode-section";

/**
 * Applies the shop-wide default theme mode (Settings → Appearance) — but only for a
 * device/user who hasn't made their own explicit light/dark choice yet. next-themes only
 * writes its "theme" localStorage key once someone actually uses the toggle, so an empty key
 * here reliably means "never overridden on this device," and a personal choice always wins
 * over the shop default once made. Renders nothing.
 */
export function DefaultThemeLoader() {
  const { data: defaultMode } = useAppSetting<string>("defaultThemeMode", DEFAULT_THEME_MODE);
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!defaultMode) return;
    try {
      if (localStorage.getItem("theme")) return;
    } catch {
      return;
    }
    setTheme(defaultMode);
  }, [defaultMode, setTheme]);

  return null;
}
