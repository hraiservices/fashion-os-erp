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
const SIGNED_URL_TTL_SECONDS = 3600;
// Re-signing a path produces a different URL (a new token in the query string) even though the
// underlying object hasn't changed, which the browser's HTTP cache treats as a brand-new
// resource — a full re-download, not a cache hit. Caching the signed URL per path for most of
// its real lifetime (one shared Map, module-level so it survives remounts of any component using
// this hook) lets the same URL — and so the browser's own cache — get reused across screen
// visits instead of a fresh one being minted, and re-downloaded, every time.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const REFRESH_MARGIN_MS = 5 * 60_000;

export function useResolvedMediaUrl(bucket: string, value: string | null | undefined): string | null {
  // Keyed by the exact path it was resolved from (rather than a bare string) so a value change
  // between two different Storage paths can't briefly render the PREVIOUS path's signed URL
  // while the new one is still in flight.
  const [resolved, setResolved] = useState<{ path: string; url: string } | null>(() => {
    if (!isMigratedMediaPath(value)) return null;
    const cached = signedUrlCache.get(`${bucket}:${value}`);
    return cached && cached.expiresAt > Date.now() ? { path: value, url: cached.url } : null;
  });

  useEffect(() => {
    if (!isMigratedMediaPath(value)) return;
    const cacheKey = `${bucket}:${value}`;
    const cached = signedUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return;
    let cancelled = false;
    createClient()
      .storage.from(bucket)
      .createSignedUrl(value, SIGNED_URL_TTL_SECONDS)
      .then(({ data }) => {
        if (!data?.signedUrl) return;
        signedUrlCache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 - REFRESH_MARGIN_MS });
        if (!cancelled) setResolved({ path: value, url: data.signedUrl });
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, value]);

  if (!value) return null;
  if (!isMigratedMediaPath(value)) return value;
  return resolved?.path === value ? resolved.url : null;
}
