"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Skeleton } from "@/components/ui/skeleton";

/** Guards a direct URL visit to a Settings sub-page the current role can't use. */
export function SettingsGuard({ allow, children }: { allow: (opts: { isAdmin: boolean; canManageShop: boolean; isSuperAdmin: boolean }) => boolean; children: React.ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const canManageShop = !user?.restricted;
  const isSuperAdmin = !!user?.isSuperAdmin;
  const allowed = !isLoading && allow({ isAdmin, canManageShop, isSuperAdmin });

  useEffect(() => {
    if (!isLoading && !allowed) router.replace("/settings/personalize");
  }, [isLoading, allowed, router]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!allowed) return null;
  return <>{children}</>;
}
