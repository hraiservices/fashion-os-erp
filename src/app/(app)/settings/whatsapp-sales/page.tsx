"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

/** WhatsApp Templates now lives on the consolidated /settings/whatsapp page — this route stays
 *  live only for old bookmarks/links. */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/whatsapp");
  }, [router]);
  return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
}
