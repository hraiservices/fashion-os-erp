"use client";

import { Lock } from "lucide-react";

/**
 * What a Targets screen shows when the server refused the very first request (no Targets permission for this login,
 * or the module is switched off for the shop). Without it these screens sat on a loading skeleton, or an empty list,
 * for ever — as if the data were still coming.
 */
export function TargetsNoAccess({ message }: { message?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-2 p-8 text-center">
      <Lock className="size-8 text-muted-foreground" />
      <p className="text-base font-semibold">Targets isn&apos;t available to you</p>
      <p className="text-sm text-muted-foreground">{message || "Ask an admin to give your login access to Targets."}</p>
    </div>
  );
}
