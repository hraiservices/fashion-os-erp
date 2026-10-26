"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ORDER_MEDIA_BUCKET, isOrderMediaPath } from "@/lib/supabase/media-storage-shared";

const SIGNED_URL_TTL_SECONDS = 3600;
// Same reasoning as src/hooks/use-resolved-media-url.ts's identical cache: a re-signed path is a
// different URL even though the object is unchanged, which defeats the browser's HTTP cache and
// forces a full re-download. One shared module-level cache so remounting this component (e.g.
// revisiting an order) reuses the same signed URL — and so the same cached image — instead of
// minting (and re-downloading) a fresh one.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const REFRESH_MARGIN_MS = 5 * 60_000;

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
  const [resolved, setResolved] = useState<Record<string, string>>(() => {
    const fromCache: Record<string, string> = {};
    const now = Date.now();
    for (const p of paths) {
      const cached = signedUrlCache.get(p);
      if (cached && cached.expiresAt > now) fromCache[p] = cached.url;
    }
    return fromCache;
  });
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
            const path = d.path || toFetch[i];
            if (d.signedUrl) {
              next[path] = d.signedUrl;
              signedUrlCache.set(path, { url: d.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 - REFRESH_MARGIN_MS });
            }
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
