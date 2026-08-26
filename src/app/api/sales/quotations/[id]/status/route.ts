import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({ status: z.enum(["draft", "sent", "accepted", "expired", "cancelled"]) });

/** Set a quotation's status. Previously ran entirely client-side with no permission check. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to manage quotations" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data: quote } = await supabase.from("sales_quotations").select("quote_number").eq("id", id).maybeSingle();

  const { error } = await supabase.from("sales_quotations").update({ status: parsed.data.status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Quotation ${quote?.quote_number ?? id} marked ${parsed.data.status}`);
  return NextResponse.json({ ok: true });
}
