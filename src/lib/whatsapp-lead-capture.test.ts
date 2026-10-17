import { describe, expect, it } from "vitest";
import { extractAllMessages } from "./whatsapp-lead-capture";

const wrap = (messages: unknown[]) => ({ entry: [{ changes: [{ value: { contacts: [{ wa_id: "919876543210", profile: { name: "Asha" } }], messages } }] }] });

describe("extractAllMessages", () => {
  it("reads text and media messages with the profile name", () => {
    const out = extractAllMessages(
      wrap([
        { id: "w1", from: "919876543210", type: "text", text: { body: "Hi, need a lehenga" } },
        { id: "w2", from: "919876543210", type: "image", image: { id: "m1", mime_type: "image/jpeg", caption: "design" } },
      ])
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ text: { body: "Hi, need a lehenga" }, profileName: "Asha" });
    expect(out[1].media).toEqual({ id: "m1", mime_type: "image/jpeg", filename: undefined });
    expect(out[1].caption).toBe("design");
  });
  it("ignores status-only and malformed payloads", () => {
    expect(extractAllMessages({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] })).toEqual([]);
    expect(extractAllMessages(null)).toEqual([]);
  });
});
