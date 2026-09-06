"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { isNativePlatform } from "@/lib/capacitor";

const LIGHT = "#ffffff";
const DARK = "#0a0a0a";

/**
 * layout.tsx's static `<meta name="theme-color" media="...">` pair only tracks the OS-level
 * light/dark preference — it can't react to an explicit override via ThemeToggle (next-themes'
 * `setTheme`), since that just flips a `.dark` class rather than changing which media query
 * matches. Without this, choosing "dark" while the OS is in light mode (or vice versa) leaves
 * Android's status bar / Safari's tab-bar chrome showing the wrong color against the app's
 * actual background. Renders nothing — just keeps the meta tag's `content` in sync.
 *
 * Inside the Capacitor shell there's no browser chrome to color via a meta tag at all — the
 * status bar is a real native view, controlled through the StatusBar plugin instead. Same
 * light/dark source of truth, so it stays in sync with every other theme-aware surface in the
 * app rather than defaulting to whatever the OS-level appearance happens to be.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = resolvedTheme === "dark" ? DARK : LIGHT;
    document.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.setAttribute("content", color));

    if (isNativePlatform()) {
      import("@capacitor/status-bar")
        .then(({ StatusBar, Style }) =>
          Promise.all([StatusBar.setBackgroundColor({ color }), StatusBar.setStyle({ style: resolvedTheme === "dark" ? Style.Dark : Style.Light })])
        )
        .catch(() => {});
    }
  }, [resolvedTheme]);

  return null;
}
