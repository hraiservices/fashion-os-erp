"use client";

import { useEffect, useState } from "react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_DASHBOARD_HEADER_CONFIG, type DashboardHeaderConfig } from "@/lib/dashboard-header";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Minimal wireframe globe — an outlined circle with rotating longitude arcs (no landmass
 * shapes). CSS-only; this app can't reach a CDN for a Lottie asset at runtime.
 */
function RotatingGlobe() {
  return (
    <span className="relative inline-flex size-5 shrink-0 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 40 40" className="size-full animate-[spin_5s_linear_infinite] text-muted-foreground">
        <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <ellipse cx="20" cy="20" rx="7" ry="18" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <ellipse cx="20" cy="20" rx="18" ry="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <line x1="2" y1="20" x2="38" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      </svg>
    </span>
  );
}

/** Inline SVG Indian tricolor — avoids relying on the OS/browser having a flag-emoji font (Windows often shows "IN" instead). */
function IndiaFlag() {
  return (
    <svg viewBox="0 0 36 24" className="h-4 w-6 shrink-0 rounded-[2px] shadow-sm ring-1 ring-black/10" aria-label="India" role="img">
      <rect width="36" height="8" y="0" fill="#FF9933" />
      <rect width="36" height="8" y="8" fill="#FFFFFF" />
      <rect width="36" height="8" y="16" fill="#138808" />
      <circle cx="18" cy="12" r="3.2" fill="none" stroke="#000080" strokeWidth="0.4" />
      <circle cx="18" cy="12" r="0.5" fill="#000080" />
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i * 360) / 24;
        return <line key={i} x1="18" y1="12" x2="18" y2="8.9" stroke="#000080" strokeWidth="0.3" transform={`rotate(${angle} 18 12)`} />;
      })}
    </svg>
  );
}

/**
 * Live clock + date + rotating globe + flag shown right after the dashboard greeting.
 * Each piece is independently toggleable from Settings → Appearance (dashboardHeader
 * app_setting). Colors are fixed (blue/green/red) per the shop owner's request; font
 * still follows the shop-wide font setting since only `color` is set here.
 */
export function DigitalClock() {
  const { data } = useAppSetting<DashboardHeaderConfig>("dashboardHeader", DEFAULT_DASHBOARD_HEADER_CONFIG);
  const cfg = data || DEFAULT_DASHBOARD_HEADER_CONFIG;
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initial = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, []);

  if (!cfg.showClock && !cfg.showDate && !cfg.showGlobe && !cfg.showFlag) return null;
  if (!now) return <div className="h-8 w-44 shrink-0 animate-pulse rounded-md bg-muted" aria-hidden />;

  const h = pad(now.getHours() % 12 === 0 ? 12 : now.getHours() % 12);
  const m = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  const ampm = now.getHours() >= 12 ? "PM" : "AM";
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex flex-wrap items-center gap-2.5 text-sm">
      {cfg.showClock && (
        <div className="flex items-baseline gap-0.5 tabular-nums" aria-label={`${h}:${m}:${s} ${ampm}`}>
          <span className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{h}</span>
          <span className="text-2xl font-semibold text-muted-foreground">:</span>
          <span className="text-2xl font-semibold text-green-700 dark:text-green-400">{m}</span>
          <span className="text-2xl font-semibold text-muted-foreground">:</span>
          <span className="text-2xl font-semibold text-orange-600 dark:text-orange-400">{s}</span>
          <span className="ml-1 text-xs font-medium text-muted-foreground">{ampm}</span>
        </div>
      )}
      {cfg.showDate && <span className="text-muted-foreground">{dateStr}</span>}
      {cfg.showGlobe && <RotatingGlobe />}
      {cfg.showFlag && <IndiaFlag />}
    </div>
  );
}
