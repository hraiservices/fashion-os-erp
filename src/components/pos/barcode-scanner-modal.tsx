"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { X, RotateCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Camera-based barcode scan — secondary to the hardware wedge-scanner input on the POS
 * screen (which just types into a focused field). This is for shops/devices without a
 * dedicated scanner. Reuses the getUserMedia/stream-lifecycle pattern proven in
 * CameraModal, but decodes continuous frames via ZXing instead of taking a single snapshot.
 */
export function BarcodeScannerModal({ open, onOpenChange, onDetected }: { open: boolean; onOpenChange: (open: boolean) => void; onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    setError(null);

    reader
      .decodeFromConstraints({ video: { facingMode } }, videoRef.current!, (result, err, controls) => {
        controlsRef.current = controls;
        if (cancelled) return;
        if (result) {
          onDetected(result.getText());
          controls.stop();
          onOpenChange(false);
        }
        // NotFoundException fires continuously while no barcode is in frame — not a real error.
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Camera access failed");
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, facingMode, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden">
        <DialogHeader className="flex-row items-center justify-between border-b px-4 py-3">
          <DialogTitle>Scan barcode</DialogTitle>
          <Button variant="ghost" size="icon-sm" onClick={() => setFacingMode((f) => (f === "environment" ? "user" : "environment"))} aria-label="Switch camera">
            <RotateCw className="size-4" />
          </Button>
        </DialogHeader>
        <div className="relative aspect-square bg-black">
          {error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white">{error}</div>
          ) : (
            <video ref={videoRef} className="size-full object-cover" muted playsInline />
          )}
          <Button variant="ghost" size="icon-sm" className="absolute right-2 top-2 bg-black/40 text-white hover:bg-black/60" onClick={() => onOpenChange(false)} aria-label="Close scanner">
            <X className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
