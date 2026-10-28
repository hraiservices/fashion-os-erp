"use client";

import { useRef, useState } from "react";
import { Receipt, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/media";
import { Button } from "@/components/ui/button";

/**
 * Zoho-style "Drag or Drop your Receipts" box, simplified to a tap-to-upload control — snaps or
 * picks one receipt photo, compresses it client-side (same compressImage() the order/attendance
 * media capture flows use), and hands the caller a data: URL to submit as `receiptDataUrl`.
 * `existingUrl` shows the currently-saved receipt (a signed URL from the server) until a new one
 * is picked; `onRemove` is omitted when there's nothing to remove.
 */
export function ReceiptUpload({
  dataUrl,
  existingUrl,
  onChange,
  onRemove,
}: {
  /** A freshly picked, not-yet-saved receipt (compressed data: URL) — takes priority over `existingUrl` for the preview. */
  dataUrl: string | null;
  /** The already-saved receipt's signed URL, shown until a new one is picked. */
  existingUrl?: string | null;
  onChange: (dataUrl: string) => void;
  onRemove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const preview = dataUrl || existingUrl || null;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await compressImage(file, 1600, 0.78);
      onChange(compressed);
    } catch {
      toast.error("Could not read that image");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-4">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      {preview ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: or short-lived signed URL, not an asset Next's image optimizer should process */}
          <img src={preview} alt="Receipt" className="size-24 shrink-0 rounded-lg border object-cover" />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            <p className="text-xs text-muted-foreground">Receipt attached</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Replace
              </Button>
              {onRemove && (
                <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
                  <X className="size-3.5" /> Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="flex w-full flex-col items-center gap-2 py-4 text-center">
          <Receipt className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">{busy ? "Processing…" : "Add a receipt photo"}</p>
          <p className="text-xs text-muted-foreground">Optional — tap to take or choose a photo</p>
        </button>
      )}
    </div>
  );
}
