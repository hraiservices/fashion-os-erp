"use client";

import { useEffect } from "react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_FONT_CONFIG, googleFontUrl, type FontConfig } from "@/lib/fonts";

const LINK_ID = "sw-google-font-link";

// Text and buttons across the app read as too small on phones — almost all Tailwind sizing
// (text-*, p-*, h-*, gap-*, ...) is rem-based, tied to this root font-size, so bumping it is
// the one lever that scales virtually everything at once instead of hand-tuning every
// component. Applied only below `sm` (640px) so the shop's chosen desktop size is untouched;
// mirrored in the blocking <head> script in layout.tsx so a repeat visit doesn't flash the
// smaller size before this effect runs.
const MOBILE_BOOST_PX = 3;

/**
 * Applies the shop-wide font (family/weight/size) chosen in Settings → Font to the
 * whole app. Renders nothing — injects a Google Fonts <link> and sets inline styles
 * on <html>, which win over Tailwind's font-sans utility via normal CSS specificity.
 */
export function FontLoader() {
  const { data } = useAppSetting<FontConfig>("font", DEFAULT_FONT_CONFIG);

  useEffect(() => {
    const cfg = data || DEFAULT_FONT_CONFIG;
    const root = document.documentElement;

    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = LINK_ID;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = googleFontUrl(cfg.family, cfg.weight);

    root.style.setProperty("font-family", `"${cfg.family}", sans-serif`);
    root.style.setProperty("font-weight", String(cfg.weight));

    const mql = window.matchMedia("(max-width: 640px)");
    const applySize = () => root.style.setProperty("font-size", `${cfg.size + (mql.matches ? MOBILE_BOOST_PX : 0)}px`);
    applySize();
    mql.addEventListener("change", applySize);

    // Cached so the blocking <script> in layout.tsx's <head> can re-apply this choice on the
    // very next page load before React (and this effect) even runs — see that script's comment.
    try {
      localStorage.setItem("shop-font-config", JSON.stringify(cfg));
    } catch {
      // Private browsing / storage disabled — fine, this is just a perf nicety.
    }

    return () => mql.removeEventListener("change", applySize);
  }, [data]);

  return null;
}
