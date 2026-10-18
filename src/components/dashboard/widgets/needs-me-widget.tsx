"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { NeedsMeItem } from "@/lib/needs-me";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const DOT = { red: "bg-red-500", amber: "bg-amber-500", blue: "bg-sky-500" } as const;

/** One short, ranked list of what the owner should look at today, each line a tap away from the screen that fixes it. */
export function NeedsMeWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "needs-me"],
    queryFn: async (): Promise<{ items: NeedsMeItem[] }> => {
      const res = await fetch("/api/dashboard/needs-me");
      if (!res.ok) throw new Error("Couldn't load");
      const body = (await res.json().catch(() => null)) as { items?: NeedsMeItem[] } | null;
      return { items: Array.isArray(body?.items) ? body.items : [] };
    },
    staleTime: 5 * 60_000,
  });
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (isError || !data) return null;

  return (
    <section className="flex h-full flex-col rounded-xl border bg-card">
      <div className="shrink-0 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">What needs me today</h2>
      </div>
      {data.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <CheckCircle2 className="size-8 text-emerald-600" />
          <p className="text-sm font-medium">You&apos;re all caught up</p>
          <p className="text-xs text-muted-foreground">No late orders, overdue money, stale leads or low stock right now.</p>
        </div>
      ) : (
        <ul className="flex-1 divide-y">
          {data.items.map((it) => (
            <li key={it.key}>
              <Link href={it.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
                <span className={cn("size-2.5 shrink-0 rounded-full", DOT[it.level])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{it.label}</span>
                  <span className="block text-xs text-muted-foreground">{it.detail}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
