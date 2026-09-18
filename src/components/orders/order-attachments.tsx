"use client";

import { useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * Read-only view of an order's attachments. Photos open full-size in a lightbox;
 * audio/video use native players so the browser handles whatever codec was recorded.
 */
export function OrderAttachments({ images, audios, videos }: { images: string[]; audios: string[]; videos: string[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const total = images.length + audios.length + videos.length;
  if (total === 0) return null;

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
                onClick={() => setLightbox(src)}
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

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightbox && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightbox} alt="Attachment full size" className="max-h-[80dvh] w-full rounded-md object-contain" />
              <button
                type="button"
                aria-label="Close"
                onClick={() => setLightbox(null)}
                className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="size-4" />
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
