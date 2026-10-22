"use client";

import { useEffect } from "react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { COLOR_THEMES, DEFAULT_COLOR_THEME, SIDEBAR_STYLES, DEFAULT_SIDEBAR_STYLE, DEFAULT_CORNER_STYLE, cornerStyleRadius } from "@/lib/color-themes";

/** Cached so the blocking <script> in layout.tsx's <head> can re-apply this choice on the very
 *  next page load before React (and these effects) even run — see that script's comment. */
const CACHE_KEY = "shop-color-config";

function cacheConfig(colorTheme: string, sidebarStyle: string, cornerStyle: string) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ colorTheme, sidebarStyle, cornerStyle }));
  } catch {
    // Private browsing / storage disabled — fine, this is just a perf nicety.
  }
}

/**
 * Applies the shop-wide accent color, sidebar style, and corner radius chosen in
 * Settings → Appearance to the whole app. Toggles `theme-<id>`/`sidebar-<id>` classes and
 * the --radius CSS var on <html> — CSS rules in globals.css do the rest, in both light and
 * dark mode. Renders nothing.
 */
export function ColorThemeLoader() {
  const { data: colorTheme } = useAppSetting<string>("colorTheme", DEFAULT_COLOR_THEME);
  const { data: sidebarStyle } = useAppSetting<string>("sidebarStyle", DEFAULT_SIDEBAR_STYLE);
  const { data: cornerStyle } = useAppSetting<string>("cornerStyle", DEFAULT_CORNER_STYLE);

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

  useEffect(() => {
    document.documentElement.style.setProperty("--radius", cornerStyleRadius(cornerStyle || DEFAULT_CORNER_STYLE));
  }, [cornerStyle]);

  // One combined effect so a page that only just mounted (colorTheme resolved, sidebarStyle/
  // cornerStyle still defaulted) doesn't overwrite the cache with values the queries haven't
  // actually confirmed yet — each of the three still applies to the DOM immediately above,
  // this only gates what gets written for the *next* load's blocking script to read.
  useEffect(() => {
    if (colorTheme == null || sidebarStyle == null || cornerStyle == null) return;
    cacheConfig(colorTheme || DEFAULT_COLOR_THEME, sidebarStyle || DEFAULT_SIDEBAR_STYLE, cornerStyle || DEFAULT_CORNER_STYLE);
  }, [colorTheme, sidebarStyle, cornerStyle]);

  return null;
}
