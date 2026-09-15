"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** Tap-to-enlarge grid for order photos on the public track page — plain <img> (external URLs,
 *  not optimizable via next/image) with a lightbox dialog for the full-size view. */
export function OrderPhotoGallery({ images }: { images: string[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpenIdx(i)}
            className="aspect-square overflow-hidden rounded-lg border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- external order-photo URL, not an optimizable remote image */}
            <img src={src} alt={`Order photo ${i + 1}`} className="size-full object-cover" />
          </button>
        ))}
      </div>

      <Dialog open={openIdx !== null} onOpenChange={(open) => !open && setOpenIdx(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] p-2 sm:max-w-lg">
          <DialogTitle className="sr-only">
            Order photo {openIdx != null ? openIdx + 1 : ""}
          </DialogTitle>
          {openIdx !== null && (
            // eslint-disable-next-line @next/next/no-img-element -- external order-photo URL, not an optimizable remote image
            <img src={images[openIdx]} alt={`Order photo ${openIdx + 1}`} className="max-h-[80dvh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
