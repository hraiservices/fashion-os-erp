import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  notes: z.string().default(""),
});

/** Create/update a price list. Previously ran entirely client-side with no permission check —
 *  any authenticated user could create/rewrite a customer's assigned pricing tier. */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to manage price lists" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  if (fd.id) {
    const { error } = await supabase.from("price_lists").update({ name: fd.name, notes: fd.notes }).eq("id", fd.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: fd.id });
  }

  const { data, error } = await supabase.from("price_lists").insert({ name: fd.name, notes: fd.notes, created_by: user.email }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
