import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { forbidden, notFound, serverError } from "@/lib/targets-api";
import { targetsContext } from "@/lib/targets-server";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE — whoever added the link, or anyone who sees everything. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const { data: doc } = await db.from("work_documents").select("created_by").eq("id", id).maybeSingle();
  if (!doc) return notFound("Document not found");
  const mine = !!doc.created_by && doc.created_by.toLowerCase() === ctx.email.toLowerCase();
  if (!mine && !ctx.seesAll) return forbidden("Only the person who added a link can remove it");
  const { error } = await db.from("work_documents").delete().eq("id", id);
  if (error) return serverError(error.message);
  return NextResponse.json({ ok: true });
}
