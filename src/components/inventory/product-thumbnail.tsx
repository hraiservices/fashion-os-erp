"use client";

import type { ReactNode } from "react";
import { useResolvedMediaUrl } from "@/hooks/use-resolved-media-url";
import { PRODUCT_MEDIA_BUCKET } from "@/lib/supabase/media-resolve";

/**
 * A product's photo, resolving a Storage object path to a displayable signed URL when needed
 * (see src/lib/supabase/product-media-storage.ts) — a legacy base64 data: URL renders directly.
 * Pulled out of each list/row that shows a product photo because the resolution hook has to run
 * once per row, not once for a whole mapped list.
 */
export function ProductThumbnail({
  imageDataUrl,
  alt = "",
  className,
  fallback,
}: {
  imageDataUrl: string | null;
  alt?: string;
  className?: string;
  fallback: ReactNode;
}) {
  const url = useResolvedMediaUrl(PRODUCT_MEDIA_BUCKET, imageDataUrl);
  if (!url) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
