"use client";

import { useEffect } from "react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { COLOR_THEMES, DEFAULT_COLOR_THEME, SIDEBAR_STYLES, DEFAULT_SIDEBAR_STYLE } from "@/lib/color-themes";

/**
 * Applies the shop-wide accent color and sidebar style chosen in Settings → Appearance
 * to the whole app. Toggles `theme-<id>` and `sidebar-<id>` classes on <html> — CSS rules
 * in globals.css do the rest, in both light and dark mode. Renders nothing.
 */
export function ColorThemeLoader() {
  const { data: colorTheme } = useAppSetting<string>("colorTheme", DEFAULT_COLOR_THEME);
  const { data: sidebarStyle } = useAppSetting<string>("sidebarStyle", DEFAULT_SIDEBAR_STYLE);

  useEffect(() => {
    const id = colorTheme || DEFAULT_COLOR_THEME;
    const root = document.documentElement;
    COLOR_THEMES.forEach((t) => root.classList.remove(`theme-${t.id}`));
    root.classList.add(`theme-${id}`);
  }, [colorTheme]);

  useEffect(() => {
    const id = sidebarStyle || DEFAULT_SIDEBAR_STYLE;
    const root = document.documentElement;
    SIDEBAR_STYLES.forEach((s) => root.classList.remove(`sidebar-${s.id}`));
    root.classList.add(`sidebar-${id}`);
  }, [sidebarStyle]);

  return null;
}
