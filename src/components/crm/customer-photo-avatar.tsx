"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CUSTOMER_PHOTOS_BUCKET } from "@/lib/supabase/customer-photo-storage";
import { cn } from "@/lib/utils";

const SIGNED_URL_TTL_SECONDS = 3600;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Optional photo thumbnail next to the usual letter-avatar, with a camera-icon overlay to
 * add/change it. Many tailoring shops recognize a customer by face before name, so this sits
 * right at the top of the customer page.
 *
 * No `capture="environment"` on the file input, deliberately — that attribute forces Chrome's
 * own buggy in-page camera UI on Android (the exact bug fixed for order photos in PR #461
 * earlier this session); the OS's normal file picker already offers "Camera" as one of its own
 * options, more reliably.
 */
export function CustomerPhotoAvatar({ mobile, photoPath, initial, canEdit }: { mobile: string; photoPath: string; initial: string; canEdit: boolean }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!photoPath) return;
    let cancelled = false;
    createClient()
      .storage.from(CUSTOMER_PHOTOS_BUCKET)
      .createSignedUrl(photoPath, SIGNED_URL_TTL_SECONDS)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setSignedUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  // Reset the previous signed URL as soon as the photo path itself changes (new upload or a
  // different customer) rather than inside the fetch effect above, which only runs when there
  // is a path to resolve.
  const [lastPhotoPath, setLastPhotoPath] = useState(photoPath);
  if (photoPath !== lastPhotoPath) {
    setLastPhotoPath(photoPath);
    if (!photoPath) setSignedUrl(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await fetch(`/api/customers/${encodeURIComponent(mobile)}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Upload failed");
      setSignedUrl(body.url);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <span className="relative inline-flex shrink-0">
      {signedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signedUrl} alt="" className="size-12 rounded-full object-cover" />
      ) : (
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{initial}</span>
      )}
      {canEdit && (
        <>
          <button
            type="button"
            aria-label={photoPath ? "Change customer photo" : "Add customer photo"}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-card bg-muted text-muted-foreground shadow-sm hover:bg-muted/80",
              uploading && "opacity-60"
            )}
          >
            <Camera className="size-3" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </>
      )}
    </span>
  );
}
