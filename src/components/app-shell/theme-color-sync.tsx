"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

const LIGHT = "#ffffff";
const DARK = "#0a0a0a";

/**
 * layout.tsx's static `<meta name="theme-color" media="...">` pair only tracks the OS-level
 * light/dark preference — it can't react to an explicit override via ThemeToggle (next-themes'
 * `setTheme`), since that just flips a `.dark` class rather than changing which media query
 * matches. Without this, choosing "dark" while the OS is in light mode (or vice versa) leaves
 * Android's status bar / Safari's tab-bar chrome showing the wrong color against the app's
 * actual background. Renders nothing — just keeps the meta tag's `content` in sync.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = resolvedTheme === "dark" ? DARK : LIGHT;
    document.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.setAttribute("content", color));
  }, [resolvedTheme]);

  return null;
}
