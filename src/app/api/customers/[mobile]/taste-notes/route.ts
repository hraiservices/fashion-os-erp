import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { getServerUser } from "@/lib/auth-server";
import { aiErrorResponse, aiJson, SHOP_VOICE } from "@/lib/ai-assist";
import { isRestrictedRole } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/service";

type Ctx = { params: Promise<{ mobile: string }> };

const MAX_NOTES = 12;
const cleanNotes = (notes: string[]) => [...new Set(notes.map((n) => n.replace(/\s+/g, " ").trim().slice(0, 150)).filter(Boolean))].slice(0, MAX_NOTES);

async function gate(mobileParam: string) {
  const { user } = await getServerUser();
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (isRestrictedRole(user.role)) return { error: NextResponse.json({ error: "You don't have permission to do that" }, { status: 403 }) };
  const serviceClient = createServiceClient();
  if (!serviceClient) return { error: NextResponse.json({ error: "Server is not configured" }, { status: 501 }) };
  const mobile = normalizeIndianMobile(decodeURIComponent(mobileParam));
  return { user, serviceClient, mobile };
}

/** The notes are stored one per line in customers.taste_notes. `supported` is false until the add_customer_taste_notes.sql migration has run. */
async function readNotes(serviceClient: SupabaseClient<Database>, mobile: string): Promise<{ notes: string[]; supported: boolean }> {
  const { data, error } = await serviceClient.from("customers").select("*").eq("mobile", mobile).maybeSingle();
  if (error || !data) return { notes: [], supported: false };
  const row = data as unknown as { taste_notes?: string };
  if (row.taste_notes === undefined) return { notes: [], supported: false };
  return { notes: cleanNotes(row.taste_notes.split("\n")), supported: true };
}

/** GET — the customer's saved taste notes. */
export async function GET(_request: Request, { params }: Ctx) {
  const g = await gate((await params).mobile);
  if ("error" in g) return g.error;
  return NextResponse.json(await readNotes(g.serviceClient, g.mobile));
}

/** PUT — replace the notes (staff edit or approve a suggestion). */
export async function PUT(request: Request, { params }: Ctx) {
  const g = await gate((await params).mobile);
  if ("error" in g) return g.error;
  const parsed = z.object({ notes: z.array(z.string().max(300)).max(30) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid notes" }, { status: 400 });
  const notes = cleanNotes(parsed.data.notes);
  const { error } = await g.serviceClient.from("customers").update({ taste_notes: notes.join("\n") } as never).eq("mobile", g.mobile);
  if (error) return NextResponse.json({ error: "Couldn't save — has the taste-notes SQL been run?" }, { status: 500 });
  return NextResponse.json({ notes });
}

/** POST — AI suggests notes from this customer's own orders and chats. Nothing is saved; staff pick what to keep. */
export async function POST(_request: Request, { params }: Ctx) {
  const g = await gate((await params).mobile);
  if ("error" in g) return g.error;
  const { serviceClient, mobile, user } = g;
  const existing = (await readNotes(serviceClient, mobile)).notes;

  const [{ data: orders }, { data: leads }] = await Promise.all([
    serviceClient.from("orders").select("id, in_date, garments, special").eq("mobile", mobile).order("created_at", { ascending: false }).limit(40),
    serviceClient.from("leads").select("id").eq("mobile", mobile).limit(10),
  ]);
  const leadIds = (leads || []).map((l) => l.id);
  const { data: acts } = leadIds.length ? await serviceClient.from("lead_activities").select("body, created_at").in("lead_id", leadIds).order("created_at", { ascending: false }).limit(60) : { data: [] as { body: string; created_at: string }[] };

  const garmentTypes = (x: unknown) => (Array.isArray(x) ? x.map((g) => (g as { type?: string })?.type).filter(Boolean).join(", ") : "");
  const history = [
    ...(orders || []).map((o) => `Order ${o.id} (${o.in_date}): ${garmentTypes(o.garments)}${o.special ? ` — notes: ${o.special.slice(0, 200)}` : ""}`),
    ...(acts || []).map((a) => `Chat note (${a.created_at.slice(0, 10)}): ${a.body.slice(0, 250)}`),
  ];
  if (history.length === 0) return NextResponse.json({ suggestions: [] });

  try {
    const out = await aiJson<{ notes?: string[] }>(
      serviceClient,
      "memory",
      `${SHOP_VOICE}\nYou keep short style notes on a boutique customer so staff remember her taste. From the history below, write up to 6 NEW notes, each under 15 words, about clear, repeated or explicitly stated preferences: colours, fabrics, fits, necklines, work (zari etc.), budget habits, delivery habits, occasions. Only things the history actually shows — never guess or infer personal details (age, religion, health, family). Skip anything already in the existing notes. Answer as JSON: {"notes": ["..."]}.`,
      [{ text: `EXISTING NOTES:\n${existing.join("\n") || "(none)"}\n\nHISTORY:\n${history.join("\n")}` }],
      user.email
    );
    return NextResponse.json({ suggestions: cleanNotes(out.notes ?? []).filter((n) => !existing.some((e) => e.toLowerCase() === n.toLowerCase())).slice(0, 6) });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
