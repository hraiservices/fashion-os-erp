import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

/** Delete a shop location. Previously ran entirely client-side with no permission check. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const { data: location } = await supabase.from("shop_locations").select("name").eq("id", id).maybeSingle();

  const { error } = await supabase.from("shop_locations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Shop location deleted: ${location?.name ?? id}`);
  return NextResponse.json({ ok: true });
}
