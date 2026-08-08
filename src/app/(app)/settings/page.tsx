"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsIndexPage() {
  const { data: user, isLoading } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user?.restricted ? "/settings/account" : "/settings/shop");
  }, [isLoading, user, router]);

  return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
}
