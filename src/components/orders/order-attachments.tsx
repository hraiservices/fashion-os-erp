"use client";

import { useRef, useState } from "react";
import { Paperclip, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** Minimum horizontal drag (px) before a touch gesture counts as a swipe rather than a tap —
 *  low enough to feel responsive, high enough that a tap-to-close doesn't misfire as a swipe. */
const SWIPE_THRESHOLD = 50;

/**
 * Read-only view of an order's attachments. Photos open full-size in a lightbox with swipe/arrow
 * navigation between the order's other photos; audio/video use native players so the browser
 * handles whatever codec was recorded.
 */
export function OrderAttachments({ images, audios, videos }: { images: string[]; audios: string[]; videos: string[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const total = images.length + audios.length + videos.length;
  if (total === 0) return null;

  function showPrev() {
    setLightboxIndex((i) => (i === null ? null : (i - 1 + images.length) % images.length));
  }
  function showNext() {
    setLightboxIndex((i) => (i === null ? null : (i + 1) % images.length));
  }
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (dx > SWIPE_THRESHOLD) showPrev();
    else if (dx < -SWIPE_THRESHOLD) showNext();
  }

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3 print:hidden">
        <Paperclip className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Attachments</h2>
        <span className="ml-auto text-xs text-muted-foreground">{total}</span>
      </div>
      {/* Printed header — the interactive one above is hidden for print, same pattern the rest
          of the app uses for its own screen-only chrome (buttons, search bars, etc.). */}
      {images.length > 0 && <h2 className="hidden px-4 pt-4 text-sm font-semibold print:block">Photos</h2>}

      <div className="space-y-4 p-4 print:p-4">
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 print:grid-cols-3 print:gap-3">
            {images.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="aspect-square overflow-hidden rounded-lg border transition-opacity hover:opacity-90 print:aspect-auto print:h-40 print:w-full print:break-inside-avoid"
                aria-label={`View photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-height print box below works around Chromium not honoring aspect-ratio boxes when printing (they can render as zero-height and vanish from the page) */}
                <img src={src} alt={`Order photo ${i + 1}`} className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {audios.length > 0 && (
          <div className="space-y-2 print:hidden">
            <p className="text-xs font-medium text-muted-foreground">Voice notes</p>
            {audios.map((src, i) => (
              <audio key={i} controls src={src} className="h-9 w-full" />
            ))}
          </div>
        )}

        {videos.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 print:hidden">
            {videos.map((src, i) => (
              <video key={i} controls src={src} className="w-full rounded-lg border bg-black" />
            ))}
          </div>
        )}
      </div>

      <Dialog open={lightboxIndex !== null} onOpenChange={(o) => !o && setLightboxIndex(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightboxIndex !== null && (
            <div className="relative" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={images[lightboxIndex]} alt={`Attachment full size ${lightboxIndex + 1} of ${images.length}`} className="max-h-[80dvh] w-full rounded-md object-contain" />
              <button
                type="button"
                aria-label="Close"
                onClick={() => setLightboxIndex(null)}
                className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="size-4" />
              </button>
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={showPrev}
                    className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={showNext}
                    className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                  <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                    {lightboxIndex + 1} / {images.length}
                  </p>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
