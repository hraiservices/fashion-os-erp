/**
 * Media helpers for order attachments. Files are stored as base64 data URLs inside the
 * orders.images / audios / videos JSONB columns — matching the old app's storage model
 * (no Supabase Storage bucket exists in schema_v16_complete.sql).
 *
 * That storage choice is why the size caps below matter: a Postgres row holding several
 * multi-megabyte base64 blobs gets slow to fetch, and every order list query pulls them.
 */

/** Roughly the max encoded size we'll accept per attachment (base64 is ~1.37x raw bytes). */
export const MAX_IMAGE_BYTES = 900_000;
export const MAX_AUDIO_BYTES = 2_000_000;
export const MAX_VIDEO_BYTES = 4_000_000;

export function approxBytesOfDataUrl(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

export function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} KB`;
  return `${n} B`;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Downscales and re-encodes an image so a 12MP phone photo doesn't become a 6 MB base64
 * string in the database. Returns a JPEG data URL.
 */
export async function compressImage(source: Blob | HTMLVideoElement, maxDim = 1280, quality = 0.72): Promise<string> {
  let width: number;
  let height: number;
  let drawable: CanvasImageSource;
  let cleanup: (() => void) | undefined;

  if (source instanceof HTMLVideoElement) {
    width = source.videoWidth;
    height = source.videoHeight;
    drawable = source;
  } else {
    const bitmap = await createImageBitmap(source);
    width = bitmap.width;
    height = bitmap.height;
    drawable = bitmap;
    cleanup = () => bitmap.close();
  }

  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(drawable, 0, 0, w, h);
  cleanup?.();

  return canvas.toDataURL("image/jpeg", quality);
}

/** Picks the first MIME type the browser can actually record. */
export function pickRecorderMime(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export const AUDIO_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
export const VIDEO_MIME_CANDIDATES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
