import { NextResponse } from "next/server";
import { z } from "zod";

/** Small shared helpers for the /api/targets routes. */

/** A calendar date that really exists: "2026-02-30" has the right shape but would be refused by the database as a 500. */
export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-30").refine(isRealDate, "That date doesn't exist");
export const uuid = z.string().uuid();
/** Ids in the address bar are user input: a non-UUID would reach Postgres and come back as a raw 500. */
export const isUuid = (value: string) => uuid.safeParse(value).success;

export const badRequest = (message: string, extra?: Record<string, unknown>) => NextResponse.json({ error: message, ...extra }, { status: 400 });
export const notFound = (what = "Not found") => NextResponse.json({ error: what }, { status: 404 });
export const forbidden = (message = "You don't have permission to do that") => NextResponse.json({ error: message }, { status: 403 });
export const serverError = (message: string) => NextResponse.json({ error: message }, { status: 500 });

/** Parses a JSON request body with a zod schema; returns the data or a ready-made 400 response. */
export async function parseBody<S extends z.ZodTypeAny>(request: Request, schema: S): Promise<{ data: z.infer<S> } | { error: NextResponse }> {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return { error: badRequest(`${where}${first?.message || "Invalid request"}`) };
  }
  return { data: parsed.data };
}

/** Trim + cap a free-text field. */
export const text = (max: number) => z.string().trim().max(max);
