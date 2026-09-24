"use client";

import { useMutation } from "@tanstack/react-query";

export interface CreateGalleryResult {
  token: string;
  url: string;
}

/** Uploads image(s) (as base64 data: URLs) and gets back a public link — see
 *  /api/whatsapp-gallery's own comment for why a link, not a direct attach. */
export function useCreateWhatsAppGallery() {
  return useMutation({
    mutationFn: async ({ images, title }: { images: string[]; title?: string }) => {
      const res = await fetch("/api/whatsapp-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create link");
      return data as CreateGalleryResult;
    },
  });
}

/** Reads File objects into base64 data: URLs for the create-gallery request above. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
