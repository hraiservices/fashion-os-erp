"use client";

import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import type { ActivityBucket, LiveUser } from "@/hooks/use-presence";

// Portal vs Check-in are the only two categories this ever splits into, so these are fixed
// identity colors (categorical job), not a cycled palette — slots 1 (blue) and 2 (orange) of the
// app's default 8-hue categorical order, the first adjacent pair, which is the one CVD-safest
// pairing under the validator (see the dataviz skill's palette reference). Flat hex rather than a
// light/dark pair, matching how the rest of the dashboard's recharts widgets already do it (e.g.
// revenue-flow-widget.tsx's Billed/Collected/Pending lines).
const PORTAL_COLOR = "#2a78d6";
const CHECKIN_COLOR = "#eb6834";
// Matches the "LIVE" identity color used everywhere else in this feature (the pulsing dot in
// live-users-section.tsx, the pulse ring below) — a single-series sparkline is a magnitude
// chart, but one solid hue for one line is the same shortcut every other widget here takes.
const ACTIVITY_COLOR = "#10b981";

/** Tiny 12-hour login-activity sparkline — no axes, just the shape, with a hover tooltip (every
 *  line/area chart gets one, per the dataviz skill's interaction rule; a sparkline is not the
 *  "bare stat tile" exception). Shared by the dashboard card and the Settings > Users & Access
 *  section so both show the exact same chart. */
export function ActivitySparkline({ buckets, height = 40 }: { buckets: ActivityBucket[]; height?: number }) {
  if (buckets.length === 0 || buckets.every((b) => b.count === 0)) {
    return <p className="text-xs text-muted-foreground">No login activity in the last 12 hours.</p>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={buckets} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id="gLoginActivity" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACTIVITY_COLOR} stopOpacity={0.25} />
              <stop offset="100%" stopColor={ACTIVITY_COLOR} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Tooltip
            formatter={(v) => [`${v} login${v === 1 ? "" : "s"}`, ""]}
            labelFormatter={(label) => label}
            contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-popover)", fontSize: 12 }}
          />
          <Area type="monotone" dataKey="count" name="Logins" stroke={ACTIVITY_COLOR} strokeWidth={2} fill="url(#gLoginActivity)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Portal-login vs /checkin-PIN split among who's currently online — a 2-segment stacked bar
 *  (not recharts; two colored divs is simpler than a chart library for one static-width bar) with
 *  the 2px surface gap the dataviz skill's mark spec calls for between stacked segments, plus a
 *  legend row (>=2 series always gets one). Computed client-side from the live list itself — no
 *  extra endpoint, since loginType is already on every LiveUser row. */
export function PortalCheckinBreakdown({ live }: { live: LiveUser[] }) {
  const portalCount = live.filter((u) => u.loginType === "portal").length;
  const checkinCount = live.filter((u) => u.loginType === "checkin").length;
  const total = portalCount + checkinCount;
  if (total === 0) return null;

  const portalPct = (portalCount / total) * 100;
  const checkinPct = (checkinCount / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {portalCount > 0 && <div style={{ width: `${portalPct}%`, background: PORTAL_COLOR }} className="h-full" />}
        {portalCount > 0 && checkinCount > 0 && <div className="h-full w-0.5 bg-card" />}
        {checkinCount > 0 && <div style={{ width: `${checkinPct}%`, background: CHECKIN_COLOR }} className="h-full" />}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: PORTAL_COLOR }} /> Portal ({portalCount})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: CHECKIN_COLOR }} /> Check-in ({checkinCount})
        </span>
      </div>
    </div>
  );
}

/** Pulsing ring behind an online avatar — the same emerald "live" identity as the dot elsewhere
 *  in this feature, just bigger and animated to read clearly at avatar size. */
export function LivePulseRing({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-flex">
      <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-60 animate-ping" />
      {children}
    </span>
  );
}
