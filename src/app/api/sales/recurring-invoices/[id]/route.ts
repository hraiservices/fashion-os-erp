import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/** Delete a recurring-invoice profile. Previously ran entirely client-side with no permission
 *  check. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageSales) return NextResponse.json({ error: "No permission to manage recurring invoices" }, { status: 403 });

  const { data: profile } = await supabase.from("recurring_invoice_profiles").select("name").eq("id", id).maybeSingle();

  const { error } = await supabase.from("recurring_invoice_profiles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Recurring invoice profile deleted: ${profile?.name ?? id}`);
  return NextResponse.json({ ok: true });
}
