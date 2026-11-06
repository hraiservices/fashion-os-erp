"use client";

import { useEffect } from "react";
import { useAppSetting } from "@/hooks/use-app-setting";
import {
  COLOR_THEMES,
  DEFAULT_COLOR_THEME,
  SIDEBAR_STYLES,
  DEFAULT_SIDEBAR_STYLE,
  DEFAULT_CORNER_STYLE,
  cornerStyleRadius,
  isCustomColorTheme,
  customColorHex,
  customThemeVars,
  CUSTOM_THEME_VAR_NAMES,
} from "@/lib/color-themes";
import { DEFAULT_DENSITY } from "@/lib/density";

/** Cached so the blocking <script> in layout.tsx's <head> can re-apply this choice on the very
 *  next page load before React (and these effects) even run — see that script's comment. A
 *  custom color isn't cached here (its inline vars are cheap to apply but numerous to inline
 *  into the blocking script), so it has one extra frame of the default theme on reload. */
const CACHE_KEY = "shop-color-config";

function cacheConfig(colorTheme: string, sidebarStyle: string, cornerStyle: string, density: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ colorTheme, sidebarStyle, cornerStyle, density }));
  } catch {
    // Private browsing / storage disabled — fine, this is just a perf nicety.
  }
}

/**
 * Applies the shop-wide accent color, sidebar style, corner radius, and density chosen in
 * Settings → Appearance to the whole app. Toggles `theme-<id>`/`sidebar-<id>`/`density-<id>`
 * classes and the --radius CSS var on <html> — CSS rules in globals.css do the rest, in both
 * light and dark mode. A custom color (`custom:#rrggbb`) instead sets its CSS vars inline,
 * since it has no pre-authored class. Renders nothing.
 */
export function ColorThemeLoader() {
  const { data: colorTheme } = useAppSetting<string>("colorTheme", DEFAULT_COLOR_THEME);
  const { data: sidebarStyle } = useAppSetting<string>("sidebarStyle", DEFAULT_SIDEBAR_STYLE);
  const { data: cornerStyle } = useAppSetting<string>("cornerStyle", DEFAULT_CORNER_STYLE);
  const { data: density } = useAppSetting<string>("density", DEFAULT_DENSITY);

  useEffect(() => {
    const id = colorTheme || DEFAULT_COLOR_THEME;
    const root = document.documentElement;
    COLOR_THEMES.forEach((t) => root.classList.remove(`theme-${t.id}`));
    if (isCustomColorTheme(id)) {
      const vars = customThemeVars(customColorHex(id));
      CUSTOM_THEME_VAR_NAMES.forEach((k) => root.style.setProperty(k, vars[k]));
    } else {
      CUSTOM_THEME_VAR_NAMES.forEach((k) => root.style.removeProperty(k));
      root.classList.add(`theme-${id}`);
    }
  }, [colorTheme]);

  useEffect(() => {
    const id = sidebarStyle || DEFAULT_SIDEBAR_STYLE;
    const root = document.documentElement;
    SIDEBAR_STYLES.forEach((s) => root.classList.remove(`sidebar-${s.id}`));
    root.classList.add(`sidebar-${id}`);
  }, [sidebarStyle]);

  // Separate from the two effects above (each keyed on just its own setting) since the
  // "colored" sidebar tint for a custom color depends on both the color and the sidebar style.
  useEffect(() => {
    const id = colorTheme || DEFAULT_COLOR_THEME;
    const style = sidebarStyle || DEFAULT_SIDEBAR_STYLE;
    const root = document.documentElement;
    if (isCustomColorTheme(id) && style === "colored") {
      root.style.setProperty("--sidebar", customThemeVars(customColorHex(id))["--sidebar-colored-tint"]);
    } else {
      root.style.removeProperty("--sidebar");
    }
  }, [colorTheme, sidebarStyle]);

  useEffect(() => {
    document.documentElement.style.setProperty("--radius", cornerStyleRadius(cornerStyle || DEFAULT_CORNER_STYLE));
  }, [cornerStyle]);

  useEffect(() => {
    const id = density || DEFAULT_DENSITY;
    document.documentElement.classList.toggle("density-compact", id === "compact");
  }, [density]);

  // One combined effect so a page that only just mounted (colorTheme resolved, the others
  // still defaulted) doesn't overwrite the cache with values the queries haven't actually
  // confirmed yet — each setting still applies to the DOM immediately above, this only gates
  // what gets written for the *next* load's blocking script to read.
  useEffect(() => {
    if (colorTheme == null || sidebarStyle == null || cornerStyle == null || density == null) return;
    cacheConfig(colorTheme || DEFAULT_COLOR_THEME, sidebarStyle || DEFAULT_SIDEBAR_STYLE, cornerStyle || DEFAULT_CORNER_STYLE, density || DEFAULT_DENSITY);
  }, [colorTheme, sidebarStyle, cornerStyle, density]);

  return null;
}
