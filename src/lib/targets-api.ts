import { NextResponse } from "next/server";
import { z } from "zod";

/** Small shared helpers for the /api/targets routes. */

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-30");
export const uuid = z.string().uuid();

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
