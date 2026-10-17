import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { CHAT_CHUNK_CHARS, chunkChat, looksLikeChatExport, parseChatExport } from "@/lib/whatsapp-export";

function zipFile(files: Record<string, Uint8Array>, name = "WhatsApp Chat with Asha.zip"): File {
  return new File([zipSync(files) as BlobPart], name, { type: "application/zip" });
}

describe("looksLikeChatExport", () => {
  it("recognises zips and chat text files", () => {
    expect(looksLikeChatExport({ name: "WhatsApp Chat with Asha.zip" })).toBe(true);
    expect(looksLikeChatExport({ name: "_chat.txt" })).toBe(true);
    expect(looksLikeChatExport({ name: "WhatsApp Chat with Asha.txt" })).toBe(true);
    expect(looksLikeChatExport({ name: "notes.txt" })).toBe(false);
    expect(looksLikeChatExport({ name: "photo.jpg" })).toBe(false);
  });
});

describe("chunkChat", () => {
  it("keeps a short chat whole", () => {
    expect(chunkChat("a\nb\nc")).toEqual(["a\nb\nc"]);
  });
  it("splits long chats on line breaks without losing a line", () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `[17/10, 10:00] Asha: message number ${i}`);
    const chunks = chunkChat(lines.join("\n"));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= CHAT_CHUNK_CHARS)).toBe(true);
    expect(chunks.join("\n")).toBe(lines.join("\n"));
  });
  it("cuts a single oversized line so no piece is too long", () => {
    const chunks = chunkChat("x".repeat(CHAT_CHUNK_CHARS * 2 + 5));
    expect(chunks.every((c) => c.length <= CHAT_CHUNK_CHARS)).toBe(true);
    expect(chunks.join("").length).toBe(CHAT_CHUNK_CHARS * 2 + 5);
  });
  it("returns nothing for an empty chat", () => {
    expect(chunkChat("  \n ")).toEqual([]);
  });
});

describe("parseChatExport", () => {
  it("reads a bare .txt export", async () => {
    const out = await parseChatExport(new File(["hello\nworld"], "_chat.txt"));
    expect(out).toEqual({ chat: "hello\nworld", media: [], skipped: [] });
  });

  it("splits a zip into the chat and its media, skipping what it cannot keep", async () => {
    const file = zipFile({
      "_chat.txt": strToU8("[17/10] Asha: hi"),
      "IMG-1.jpg": new Uint8Array([1, 2, 3]),
      "PTT-1.opus": new Uint8Array([4, 5]),
      "tool.exe": new Uint8Array([9]),
    });
    const out = await parseChatExport(file);
    expect(out.chat).toBe("[17/10] Asha: hi");
    expect(out.media.map((f) => [f.name, f.type])).toEqual([
      ["IMG-1.jpg", "image/jpeg"],
      ["PTT-1.opus", "audio/ogg"],
    ]);
    expect(out.skipped).toEqual(["tool.exe"]);
  });

  it("rejects a file that is not a zip or txt", async () => {
    await expect(parseChatExport(new File(["x"], "pic.jpg"))).rejects.toThrow(/not a WhatsApp chat export/);
    await expect(parseChatExport(new File(["not a zip"], "x.zip"))).rejects.toThrow(/Couldn't open/);
  });
});
