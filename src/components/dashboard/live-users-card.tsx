"use client";

import Link from "next/link";
import { Radio } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fmtDate, fmtTime } from "@/lib/format";
import { useLiveUsers } from "@/hooks/use-presence";

const MAX_SHOWN = 5;

/** Fixed (not a removable/customizable widget) admin-only dashboard card — "who's online right
 *  now", click-through to the full Settings > Users & Access list. Deliberately outside the
 *  DashboardGrid widget system: this is presence data about the shop's own staff, not a
 *  business-metrics tile someone would want to hide/reorder like Orders Today or Revenue. */
export function LiveUsersCard() {
  const { data } = useLiveUsers();
  const live = data?.live || [];
  const shown = live.slice(0, MAX_SHOWN);
  const overflow = live.length - shown.length;

  return (
    <Link href="/settings/users" className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Radio className={live.length > 0 ? "size-3.5 text-emerald-500" : "size-3.5"} />
        Who&apos;s online
      </div>

      {live.length > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex -space-x-2">
            {shown.map((u) => (
              <Avatar key={u.subjectKey} className="size-8 border-2 border-card">
                <AvatarFallback className="text-xs">{u.displayName[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
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
    </Link>
  );
}
