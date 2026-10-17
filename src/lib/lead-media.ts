/** Shared rules for files attached to a lead (see supabase/migrations/add_lead_attachments.sql). Pure — safe in client and server code. */

export const LEAD_MEDIA_BUCKET = "lead-media";
export const LEAD_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

export type LeadMediaKind = "image" | "audio" | "video" | "file";

/** What WhatsApp hands over: photos, voice notes (ogg/opus, m4a, mp3), short videos, PDFs and common design/office files. */
const FILE_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/postscript",
  "application/illustrator",
  "text/plain",
]);

export function leadMediaKind(contentType: string): LeadMediaKind | null {
  const t = contentType.toLowerCase().split(";")[0].trim();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  if (FILE_TYPES.has(t)) return "file";
  return null;
}

/** A storage-safe object name: keeps the extension, drops everything else that could break a path. */
export function safeObjectName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  return ext ? `${crypto.randomUUID()}.${ext}` : crypto.randomUUID();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
  opus: "audio/ogg", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", mp3: "audio/mpeg", aac: "audio/aac", wav: "audio/wav", amr: "audio/amr",
  mp4: "video/mp4", mov: "video/quicktime", "3gp": "video/3gpp",
  pdf: "application/pdf", zip: "application/zip", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain",
};

/** Some phones leave File.type empty for WhatsApp voice notes (.opus) and the like — fall back to the extension. */
export function guessContentType(name: string, reported: string): string {
  if (reported) return reported;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return TYPE_BY_EXTENSION[ext] ?? "";
}
