import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { fmtNow } from "@/lib/business-rules";
import { logAction } from "@/lib/logging";
import { materialBadgeLabel, missingMaterials, normalizeMaterials, parseMaterials } from "@/lib/order-materials";
import type { Json } from "@/lib/supabase/database.types";

const bodySchema = z.object({
  materials: z.array(z.object({ key: z.string(), label: z.string().max(40).optional(), received: z.boolean() })).max(12),
  materialsNote: z.string().max(300).optional(),
});

/**
 * Sets which raw materials an order needs and which have arrived. A plain two-column update (not edit_order) so
 * ticking "buttons received" never touches money, garments or tailor pay — gated on editOrder like any order edit.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.editOrder) return NextResponse.json({ error: "No permission to edit orders" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });

  const { data: cur, error: readError } = await db.from("orders").select("materials, materials_note, history").eq("id", id).maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!cur) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const before = parseMaterials(cur.materials);
  const next = normalizeMaterials(parsed.data.materials, before);
  const note = (parsed.data.materialsNote ?? cur.materials_note ?? "").trim();

  const summary = materialBadgeLabel(next) || "no material tracked";
  const missing = missingMaterials(next);
  const line = `${fmtNow()} — ${user.email.split("@")[0]}: raw material ${summary}${missing ? ` (awaiting ${missing})` : ""}`;
  const history = [...((Array.isArray(cur.history) ? cur.history : []) as string[]), line];

  const { error } = await db.from("orders").update({ materials: next as unknown as Json, materials_note: note, history }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `🧵 Raw material updated: ${summary}`, id, missing ? `Awaiting: ${missing}` : null);
  return NextResponse.json({ materials: next, materialsNote: note });
}
