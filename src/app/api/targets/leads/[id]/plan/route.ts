import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { badRequest, notFound, parseBody, text } from "@/lib/targets-api";
import { leadVisible, targetsContext } from "@/lib/targets-server";
import { activeSequenceOf, cancelSequenceTasks, loadSequences, startSequence } from "@/lib/lead-sequence-server";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ action: z.enum(["start", "stop"]), sequenceId: text(40).optional() });

/** GET — the plans a shop has set up, and which one this lead is already on. */
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const db: SupabaseClient<Database> = gate.ctx.db;

  const { data: row } = await db.from("leads").select("assigned_employee_id, created_by").eq("id", id).maybeSingle();
  if (!row || !leadVisible(row, gate.ctx)) return notFound("Lead not found");
  const [sequences, active] = await Promise.all([loadSequences(db), activeSequenceOf(db, id)]);
  return NextResponse.json({ sequences: sequences.map((s) => ({ id: s.id, name: s.name, steps: s.steps.length })), active });
}

/** POST — start a follow-up plan on this lead, or call off whatever is left of one. Creates tasks only; nothing is sent. */
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext("manageLeads");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const body = await parseBody(request, schema);
  if ("error" in body) return body.error;

  const { data: row } = await db.from("leads").select("id, name, stage, assigned_employee_id, created_by").eq("id", id).maybeSingle();
  if (!row || !leadVisible(row, ctx)) return notFound("Lead not found");

  if (body.data.action === "stop") {
    const cancelled = await cancelSequenceTasks(db, id);
    return NextResponse.json({ ok: true, cancelled });
  }

  if (row.stage === "won" || row.stage === "lost") return badRequest("This lead is already decided — reopen it first");
  const sequences = await loadSequences(db);
  const seq = sequences.find((s) => s.id === body.data.sequenceId) ?? sequences[0];
  if (!seq) return badRequest("No follow-up plan has been set up yet");
  // Starting again replaces what was left, so steps can't pile up twice.
  await cancelSequenceTasks(db, id);
  const created = await startSequence(db, { id: row.id, name: row.name, assigned_employee_id: row.assigned_employee_id }, seq, ctx.email);
  return NextResponse.json({ ok: true, created, name: seq.name });
}
