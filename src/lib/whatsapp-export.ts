import { unzipSync } from "fflate";
import { LEAD_MEDIA_MAX_BYTES, guessContentType, leadMediaKind } from "@/lib/lead-media";

/**
 * Reads a WhatsApp "Export chat" file: either the `.zip` WhatsApp makes when you include media (one
 * `_chat.txt` plus the photos, voice notes and documents), or the bare `.txt` when you leave media out.
 * Pure browser/Node code — no network.
 */

/** Biggest zip we will unpack in the browser; a long chat with lots of video can be far larger. */
export const MAX_EXPORT_ZIP_BYTES = 150 * 1024 * 1024;

/** A history entry holds up to 20,000 characters; stay safely under so long chats are split, not refused. */
export const CHAT_CHUNK_CHARS = 19_000;

export interface ParsedExport {
  /** The chat text ("" when the export had none). */
  chat: string;
  /** Supported media files found in the zip. */
  media: File[];
  /** Files left out: unsupported type or over 25 MB. */
  skipped: string[];
}

const isChatName = (name: string) => /(^|\/)(_chat|whatsapp chat[^/]*)\.txt$/i.test(name) || /(^|\/)[^/]*chat[^/]*\.txt$/i.test(name);

/** True for a file that looks like a WhatsApp chat export (zip, or a chat .txt). */
export function looksLikeChatExport(file: { name: string; type?: string }): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".zip") || (name.endsWith(".txt") && isChatName(name));
}

/** Splits a long chat on line breaks into pieces no longer than `max` characters, keeping every line whole. */
export function chunkChat(text: string, max = CHAT_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    // A single absurdly long line is cut so no piece can exceed the limit.
    for (let i = 0; i === 0 || i < rawLine.length; i += max) {
      const line = rawLine.slice(i, i + max);
      if (current && current.length + line.length + 1 > max) {
        chunks.push(current);
        current = line;
      } else {
        current = current ? `${current}\n${line}` : line;
      }
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

export async function parseChatExport(file: File): Promise<ParsedExport> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) return { chat: (await file.text()).trim(), media: [], skipped: [] };
  if (!name.endsWith(".zip")) throw new Error("That is not a WhatsApp chat export (.zip or .txt)");
  if (file.size > MAX_EXPORT_ZIP_BYTES) throw new Error("That export is over 150 MB — export the chat again without media, or share the photos separately");

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("Couldn't open that zip file");
  }

  let chat = "";
  const media: File[] = [];
  const skipped: string[] = [];
  const names = Object.keys(entries).filter((n) => !n.endsWith("/") && !n.startsWith("__MACOSX/"));
  const chatName = names.find((n) => isChatName(n)) ?? names.find((n) => n.toLowerCase().endsWith(".txt"));
  for (const entryName of names) {
    const bytes = entries[entryName];
    const base = entryName.split("/").pop() || entryName;
    if (entryName === chatName) {
      chat = new TextDecoder("utf-8").decode(bytes).trim();
      continue;
    }
    const contentType = guessContentType(base, "");
    if (!leadMediaKind(contentType) || bytes.byteLength > LEAD_MEDIA_MAX_BYTES || bytes.byteLength === 0) {
      skipped.push(base);
      continue;
    }
    media.push(new File([bytes as BlobPart], base, { type: contentType }));
  }
  return { chat, media, skipped };
}
