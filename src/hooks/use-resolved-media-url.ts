"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isMigratedMediaPath } from "@/lib/supabase/media-resolve";

/**
 * Single-value counterpart to src/hooks/use-order-media.ts's useResolvedMediaUrls — resolves
 * one canonical value (a legacy base64 data: URL, a Storage object path, or null/undefined)
 * into a displayable URL. A data: URL passes through unchanged; a Storage path gets a
 * short-lived signed URL, returned once it resolves (null until then). Never mutates its
 * input — callers keep the raw value as the canonical one to submit back on save.
 */
export function useResolvedMediaUrl(bucket: string, value: string | null | undefined): string | null {
  // Keyed by the exact path it was resolved from (rather than a bare string) so a value change
  // between two different Storage paths can't briefly render the PREVIOUS path's signed URL
  // while the new one is still in flight.
  const [resolved, setResolved] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!isMigratedMediaPath(value)) return;
    let cancelled = false;
    createClient()
      .storage.from(bucket)
      .createSignedUrl(value, 3600)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setResolved({ path: value, url: data.signedUrl });
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, value]);

  if (!value) return null;
  if (!isMigratedMediaPath(value)) return value;
  return resolved?.path === value ? resolved.url : null;
}
