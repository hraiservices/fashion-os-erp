"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, ChevronDown, ChevronUp } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fmtDate, fmtTime } from "@/lib/format";
import { useLiveUsers, useLoginActivity } from "@/hooks/use-presence";
import { ActivitySparkline, PortalCheckinBreakdown, LivePulseRing } from "@/components/dashboard/live-users-charts";

const MAX_SHOWN = 5;
const COLLAPSE_KEY = "dashboard-live-users-collapsed";

/** try/catch around every localStorage call, same as use-column-visibility.ts — a private window
 *  or blocked storage should never crash the dashboard, just fall back to "not collapsed". */
function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    // Best-effort — collapse state just won't persist this session.
  }
}

/** Fixed (not a removable/customizable widget) admin-only dashboard card — "who's online right
 *  now", click-through to the full Settings > Users & Access list. Deliberately outside the
 *  DashboardGrid widget system: this is presence data about the shop's own staff, not a
 *  business-metrics tile someone would want to hide/reorder like Orders Today or Revenue.
 *  Collapsible (remembered per-device via localStorage, not a shared setting) — useful on a
 *  phone screen where every card's vertical space is at a premium. */
export function LiveUsersCard() {
  const { data } = useLiveUsers();
  const { data: activity } = useLoginActivity();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Reads localStorage only after mount, deliberately — SSR always renders "not collapsed",
    // and reading synchronously during the initial render (a lazy useState initializer) would
    // disagree with that server-rendered markup and trip a hydration mismatch instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(readCollapsed());
    setHydrated(true);
  }, []);

  const live = data?.live || [];
  const shown = live.slice(0, MAX_SHOWN);
  const overflow = live.length - shown.length;

  function toggleCollapsed(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCollapsed((c) => {
      writeCollapsed(!c);
      return !c;
    });
  }

  return (
    <Link href="/settings/users" className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Radio className={live.length > 0 ? "size-3.5 text-emerald-500" : "size-3.5"} />
        <span className="flex-1">Who&apos;s online</span>
        {/* Suppressed until hydrated so this never flashes the wrong icon before localStorage
            is read (SSR always renders "not collapsed"). */}
        {hydrated && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Show who's online" : "Hide who's online"}
            className="rounded p-0.5 hover:bg-muted"
          >
            {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          {live.length > 0 ? (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex -space-x-2">
                {shown.map((u) => (
                  <LivePulseRing key={u.subjectKey}>
                    <Avatar className="size-8 border-2 border-card">
                      <AvatarFallback className="text-xs">{u.displayName[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </LivePulseRing>
                ))}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {live.length} online now{overflow > 0 && <span className="font-normal text-muted-foreground"> (+{overflow} more)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{shown.map((u) => u.displayName).join(", ")}</p>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-sm font-semibold text-muted-foreground">No one online</p>
              {data?.lastLogin && (
                <p className="truncate text-xs text-muted-foreground">
                  Last: {data.lastLogin.displayName}, {fmtDate(data.lastLogin.occurredAt)} {fmtTime(data.lastLogin.occurredAt)}
                </p>
              )}
            </div>
          )}

          {live.length > 0 && (
            <div className="mt-3">
              <PortalCheckinBreakdown live={live} />
            </div>
          )}
          <div className="mt-3">
            <ActivitySparkline buckets={activity || []} />
          </div>
        </>
      )}
    </Link>
  );
}
