"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera as CameraIcon, SwitchCamera, RotateCcw, Check, X } from "lucide-react";
import { compressImage } from "@/lib/media";
import { isNativePlatform } from "@/lib/capacitor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * CameraModal(), Stitching_Manager_Pro_v16.html ~line 3872.
 * Captures a photo and hands back a compressed JPEG data URL.
 *
 * Inside the Capacitor shell, this defers entirely to the native Camera plugin instead of
 * getUserMedia: it opens the OS's own camera app (which already has its own retake/confirm step,
 * hardware shutter support, and a working front/back switch — getUserMedia inside an Android
 * WebView is comparatively unreliable and never got a facing-switch that works on every device).
 * The dialog below, and the getUserMedia flow with its own retake/confirm UI, exist only for the
 * plain website and installed PWA.
 *
 * The old getUserMedia-based app had a known leak here (orphaned camera streams on unmount, noted
 * at line ~10355 of the original); the cleanup below stops every track on close, unmount, and
 * facing switch.
 */
export function CameraModal({
  open,
  onOpenChange,
  onCapture,
  defaultFacing = "environment",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (dataUrl: string) => void;
  /** "user" = front/selfie camera. Defaults to "environment" (back camera) — unchanged for
   *  existing callers (order reference photos). */
  defaultFacing?: "environment" | "user";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">(defaultFacing);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const captureNative = useCallback(async () => {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, source: CameraSource.Camera, quality: 90 });
      if (!photo.dataUrl) return onOpenChange(false);
      // fetch() understands data: URLs fine in a Chromium WebView — reuses the same
      // resize/recompress path as every other capture route instead of storing the raw shot.
      const blob = await (await fetch(photo.dataUrl)).blob();
      onCapture(await compressImage(blob));
    } catch {
      // The native camera's own cancel button rejects the promise — not a real error, just close.
    } finally {
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      const t = setTimeout(() => {
        setPreview(null);
        setError(null);
      }, 0);
      return () => clearTimeout(t);
    }
    if (isNativePlatform()) {
      void captureNative();
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) setError("Could not access the camera. Check browser permissions, or use Upload instead.");
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facing, stopStream, captureNative]);

  async function snap() {
    if (!videoRef.current) return;
    try {
      setPreview(await compressImage(videoRef.current));
    } catch {
      setError("Could not capture the photo.");
    }
  }

  function usePhoto() {
    if (!preview) return;
    onCapture(preview);
    onOpenChange(false);
  }

  // The native camera app owns the entire capture UI (including its own cancel/retake) — this
  // dialog only exists long enough to trigger it, with nothing worth showing underneath.
  if (isNativePlatform()) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-black">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Captured preview" className="max-h-[55dvh] w-full object-contain" />
            ) : (
              <video ref={videoRef} playsInline muted className="max-h-[55dvh] w-full object-contain" />
            )}
          </div>
        )}

        <div className="flex gap-2">
          {preview ? (
            <>
              <Button variant="outline" className="h-12 flex-1 text-base sm:h-8 sm:text-sm" onClick={() => setPreview(null)}>
                <RotateCcw className="size-4" /> Retake
              </Button>
              <Button className="h-12 flex-1 text-base sm:h-8 sm:text-sm" onClick={usePhoto}>
                <Check className="size-4" /> Use photo
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="h-12 text-base sm:h-8 sm:text-sm" onClick={() => onOpenChange(false)}>
                <X className="size-4" /> Cancel
              </Button>
              <Button
                variant="outline"
                aria-label="Switch camera"
                className="size-12 sm:size-8"
                onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              >
                <SwitchCamera className="size-4" />
              </Button>
              <Button className="h-12 flex-1 text-base sm:h-8 sm:text-sm" disabled={!!error} onClick={snap}>
                <CameraIcon className="size-4" /> Capture
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
