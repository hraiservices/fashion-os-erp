"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ORDER_MEDIA_BUCKET, isOrderMediaPath } from "@/lib/supabase/media-storage-shared";

const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Client-side counterpart to resolveOrderImageUrls() (src/lib/supabase/media-storage.ts) — same
 * job, but from the browser, so it goes through the anon/authenticated client and the
 * order_media_select_scoped Storage RLS policy instead of a service-role client.
 *
 * Resolves an images array (legacy base64 data: URLs mixed with post-migration order-media
 * Storage paths) into a displayable array of URLs. A data: URL passes through unchanged; a
 * Storage path gets a short-lived signed URL. Never mutates its input — callers keep that as
 * the canonical array to submit back to the order, and adaptMediaChange() below translates
 * user edits back onto it.
 */
export function useResolvedMediaUrls(paths: string[]): string[] {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const key = paths.join("\u0000");

  useEffect(() => {
    const toFetch = Array.from(new Set(paths.filter(isOrderMediaPath))).filter((p) => !(p in resolved));
    if (toFetch.length === 0) return;
    let cancelled = false;
    createClient()
      .storage.from(ORDER_MEDIA_BUCKET)
      .createSignedUrls(toFetch, SIGNED_URL_TTL_SECONDS)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setResolved((prev) => {
          const next = { ...prev };
          data.forEach((d, i) => {
            if (d.signedUrl) next[d.path || toFetch[i]] = d.signedUrl;
          });
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return paths.map((p) => (isOrderMediaPath(p) ? resolved[p] || "" : p));
}

/**
 * Translates a MediaCapture-style edit — append-only additions, index-based removals only, see
 * components/orders/media-capture.tsx — made against a *display* array back onto the
 * *canonical* array, so an untouched legacy/migrated entry is never overwritten with its
 * temporary signed display URL.
 */
export function adaptMediaChange(canonical: string[], display: string[], next: string[]): string[] {
  if (next.length > display.length) return [...canonical, ...next.slice(display.length)];
  if (next.length < display.length) {
    const removedIndex = display.findIndex((v, i) => next[i] !== v);
    const idx = removedIndex === -1 ? canonical.length - 1 : removedIndex;
    return canonical.filter((_, i) => i !== idx);
  }
  return canonical;
}
