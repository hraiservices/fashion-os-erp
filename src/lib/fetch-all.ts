/**
 * PostgREST answers at most 1000 rows per request and says nothing when it cuts a result short,
 * so any query that could exceed that has to page — otherwise a report just quietly reports less
 * than the shop actually did. These two helpers are the whole of it; they were duplicated in
 * day-book-server.ts and targets-server.ts before the report routes needed them too.
 */

/** Fetches every row of a query, paging past PostgREST's 1000-row cap. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Splits a list of ids for `.in(...)`. PostgREST filters travel in the query string, so a few
 * hundred UUIDs in one `.in()` makes a URL long enough for the gateway to reject outright
 * (414) — the caller runs one page() per chunk instead and concatenates.
 */
export function chunkIds<T>(ids: T[], size = 200): T[][] {
  if (ids.length <= size) return ids.length ? [ids] : [];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** `fetchAll` over id chunks: every row matching any of `ids`, however many there are. */
export async function fetchAllByIds<T>(ids: string[], page: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const pages = await Promise.all(chunkIds(ids).map((chunk) => fetchAll<T>((a, b) => page(chunk, a, b))));
  return pages.flat();
}
