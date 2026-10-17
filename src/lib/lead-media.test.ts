import { describe, expect, it } from "vitest";
import { formatBytes, guessContentType, leadMediaKind, safeObjectName } from "@/lib/lead-media";

describe("leadMediaKind", () => {
  it("accepts what WhatsApp sends", () => {
    expect(leadMediaKind("image/jpeg")).toBe("image");
    expect(leadMediaKind("audio/ogg; codecs=opus")).toBe("audio");
    expect(leadMediaKind("video/mp4")).toBe("video");
    expect(leadMediaKind("application/pdf")).toBe("file");
  });
  it("rejects anything else", () => {
    expect(leadMediaKind("application/x-msdownload")).toBeNull();
    expect(leadMediaKind("text/html")).toBeNull();
    expect(leadMediaKind("")).toBeNull();
  });
});

describe("guessContentType", () => {
  it("keeps a reported type", () => {
    expect(guessContentType("a.bin", "image/png")).toBe("image/png");
  });
  it("falls back to the extension for voice notes with no type", () => {
    expect(guessContentType("PTT-20261017-WA0001.opus", "")).toBe("audio/ogg");
    expect(guessContentType("IMG-1.JPG", "")).toBe("image/jpeg");
    expect(guessContentType("noext", "")).toBe("");
  });
});

describe("safeObjectName", () => {
  it("keeps only a short alphanumeric extension and never the original name", () => {
    expect(safeObjectName("../../evil name.JPG")).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(safeObjectName("noext")).toMatch(/^[0-9a-f-]{36}$/);
    expect(safeObjectName("x.p/d?f")).toMatch(/^[0-9a-f-]{36}\.pdf$/);
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
