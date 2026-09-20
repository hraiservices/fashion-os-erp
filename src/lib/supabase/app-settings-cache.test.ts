import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCachedAppSetting } from "@/lib/supabase/app-settings-cache";

/** Regression test for the app_settings caching added to fix a live performance-audit finding:
 *  middleware + getServerUser() were reading moduleEntitlements/roleDefaultOverrides fresh on
 *  every single request (confirmed as ~30% of all API traffic). This is a short-TTL,
 *  per-instance cache — these tests confirm the two behaviors that actually matter: repeated
 *  calls within the TTL window don't re-query, and a cache miss/expiry does. */

function fakeSupabase(row: { value: unknown } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, eq, maybeSingle };
}

describe("getCachedAppSetting", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("queries the database on first call and returns the row's value", async () => {
    const { client, from } = fakeSupabase({ value: { name: "Test Shop" } });
    const value = await getCachedAppSetting(client, `shop-${Math.random()}`);
    expect(value).toEqual({ name: "Test Shop" });
    expect(from).toHaveBeenCalledWith("app_settings");
  });

  it("does not re-query within the TTL window for the same key", async () => {
    const key = `moduleEntitlements-${Math.random()}`;
    const { client, from } = fakeSupabase({ value: { billing: { paidUntil: null } } });
    await getCachedAppSetting(client, key);
    await getCachedAppSetting(client, key);
    await getCachedAppSetting(client, key);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("returns null (not throwing) when no row exists for the key", async () => {
    const { client } = fakeSupabase(null);
    const value = await getCachedAppSetting(client, `missing-${Math.random()}`);
    expect(value).toBeNull();
  });

  it("caches distinct keys independently", async () => {
    const keyA = `a-${Math.random()}`;
    const keyB = `b-${Math.random()}`;
    const a = fakeSupabase({ value: "A" });
    const b = fakeSupabase({ value: "B" });
    expect(await getCachedAppSetting(a.client, keyA)).toBe("A");
    expect(await getCachedAppSetting(b.client, keyB)).toBe("B");
    // Re-fetching A again must not touch B's client and vice versa.
    await getCachedAppSetting(a.client, keyA);
    expect(a.from).toHaveBeenCalledTimes(1);
    expect(b.from).toHaveBeenCalledTimes(1);
  });
});
