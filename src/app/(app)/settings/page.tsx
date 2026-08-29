"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/personalize");
  }, [router]);

  return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
}
