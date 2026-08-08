"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, SwitchCamera, RotateCcw, Check, X } from "lucide-react";
import { compressImage } from "@/lib/media";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * CameraModal(), Stitching_Manager_Pro_v16.html ~line 3872.
 * Captures a photo via getUserMedia and hands back a compressed JPEG data URL.
 * The old app had a known leak here (orphaned camera streams on unmount, noted at
 * line ~10355); the cleanup below stops every track on close, unmount, and facing switch.
 */
export function CameraModal({ open, onOpenChange, onCapture }: { open: boolean; onOpenChange: (open: boolean) => void; onCapture: (dataUrl: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      setPreview(null);
      setError(null);
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
  }, [open, facing, stopStream]);

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
              <Button variant="outline" className="flex-1" onClick={() => setPreview(null)}>
                <RotateCcw className="size-4" /> Retake
              </Button>
              <Button className="flex-1" onClick={usePhoto}>
                <Check className="size-4" /> Use photo
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                <X className="size-4" /> Cancel
              </Button>
              <Button variant="outline" aria-label="Switch camera" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}>
                <SwitchCamera className="size-4" />
              </Button>
              <Button className="flex-1" disabled={!!error} onClick={snap}>
                <Camera className="size-4" /> Capture
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
