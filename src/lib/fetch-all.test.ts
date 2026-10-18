import { describe, expect, it } from "vitest";
import { chunkIds, fetchAll, fetchAllByIds } from "@/lib/fetch-all";

/** A fake PostgREST: answers at most 1000 rows per page, like the real one. */
function table(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });
  };
  return { page, calls };
}

describe("fetchAll", () => {
  it("returns a short result in one request", async () => {
    const t = table(12);
    expect(await fetchAll(t.page)).toHaveLength(12);
    expect(t.calls).toEqual([[0, 999]]);
  });

  it("pages past the 1000-row cap", async () => {
    const t = table(2300);
    const out = await fetchAll<{ id: number }>(t.page);
    expect(out).toHaveLength(2300);
    expect(out[0].id).toBe(0);
    expect(out[2299].id).toBe(2299);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("asks once more when the last page is exactly full, so nothing is left behind", async () => {
    const t = table(2000);
    expect(await fetchAll(t.page)).toHaveLength(2000);
    expect(t.calls).toHaveLength(3);
  });

  it("throws the database's own message", async () => {
    await expect(fetchAll(() => Promise.resolve({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });
});

describe("chunkIds", () => {
  it("leaves a short list alone", () => {
    expect(chunkIds(["a", "b"])).toEqual([["a", "b"]]);
    expect(chunkIds([])).toEqual([]);
  });
  it("splits a long list and keeps every id exactly once", () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const chunks = chunkIds(ids);
    expect(chunks.map((c) => c.length)).toEqual([200, 200, 50]);
    expect(chunks.flat()).toEqual(ids);
  });
});

describe("fetchAllByIds", () => {
  it("runs one paged query per chunk and concatenates", async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `id-${i}`);
    const seen: string[][] = [];
    const out = await fetchAllByIds<{ id: string }>(ids, (chunk) => {
      seen.push(chunk);
      return Promise.resolve({ data: chunk.map((id) => ({ id })), error: null });
    });
    expect(seen.map((c) => c.length)).toEqual([200, 100]);
    expect(out.map((r) => r.id)).toEqual(ids);
  });

  it("asks for nothing when there are no ids", async () => {
    let called = false;
    const out = await fetchAllByIds<{ id: string }>([], () => {
      called = true;
      return Promise.resolve({ data: [], error: null });
    });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });
});
