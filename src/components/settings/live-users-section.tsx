"use client";

import { Radio, History, Mail, Phone, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate, fmtTime } from "@/lib/format";
import { useLiveUsers, useLoginEvents, type LiveUser, type LoginEvent } from "@/hooks/use-presence";
import { roleLabelFor } from "@/lib/permissions";

const METHOD_ICON = { email: Mail, phone: Phone, pin: KeyRound } as const;
const METHOD_LABEL = { email: "Email", phone: "Phone + PIN", pin: "Check-in PIN" } as const;

function MethodBadge({ method }: { method: keyof typeof METHOD_ICON }) {
  const Icon = METHOD_ICON[method];
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Icon className="size-3" /> {METHOD_LABEL[method]}
    </Badge>
  );
}

function LiveRow({ row }: { row: LiveUser }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      <div className="min-w-40 flex-1 truncate font-medium">{row.displayName}</div>
      {row.role && (
        <Badge variant="secondary" className="capitalize">
          {roleLabelFor(row.role)}
        </Badge>
      )}
      <MethodBadge method={row.method} />
      <span className="text-xs text-muted-foreground">since {fmtTime(row.lastSeen)}</span>
    </div>
  );
}

function EventRow({ event }: { event: LoginEvent }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
      <div className="min-w-40 flex-1 truncate font-medium">{event.displayName}</div>
      {event.role && (
        <Badge variant="secondary" className="capitalize">
          {roleLabelFor(event.role)}
        </Badge>
      )}
      <MethodBadge method={event.method} />
      <span className="text-xs text-muted-foreground">
        {fmtDate(event.occurredAt)}, {fmtTime(event.occurredAt)}
      </span>
    </div>
  );
}

/** Admin-only "who's logged in and when, who's LIVE right now" — Settings > Users & Access.
 *  Sits below the users list/wizard and the diagnostic cards, same as RoleReferenceCard. */
export function LiveUsersSection() {
  const { data: liveData, isLoading: liveLoading } = useLiveUsers();
  const { data: events, isLoading: eventsLoading } = useLoginEvents();

  const live = liveData?.live || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <Radio className="size-4 text-emerald-500" />
        <CardTitle className="text-sm">Live now ({live.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {liveLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : live.length > 0 ? (
          live.map((row) => <LiveRow key={row.subjectKey} row={row} />)
        ) : (
          <p className="py-2 text-sm text-muted-foreground">
            No one online right now
            {liveData?.lastLogin && (
              <>
                {" "}
                — last login: <span className="font-medium text-foreground">{liveData.lastLogin.displayName}</span>, {fmtDate(liveData.lastLogin.occurredAt)} {fmtTime(liveData.lastLogin.occurredAt)}
              </>
            )}
          </p>
        )}

        <div className="flex items-center gap-2 pt-3">
          <History className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Recent logins</h3>
        </div>
        {eventsLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : events && events.length > 0 ? (
          <div className="space-y-2">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">No logins recorded yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
