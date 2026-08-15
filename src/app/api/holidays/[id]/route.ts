import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const { data, error } = await supabase.from("holidays").delete().eq("id", id).select("name, date").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Holiday not found" }, { status: 404 });

  await logAction(supabase, user.email, `Holiday removed: ${data.name} (${data.date})`);
  return NextResponse.json({ ok: true });
}
