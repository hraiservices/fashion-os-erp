"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

/** Shop Profile now lives on the merged Personalize page — this route stays live only for old bookmarks/links. */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/personalize");
  }, [router]);
  return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
}
