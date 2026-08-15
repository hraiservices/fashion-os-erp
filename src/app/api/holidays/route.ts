import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { mapHolidayRow } from "@/lib/types";
import { logAction } from "@/lib/logging";

export async function GET(request: Request) {
  const { supabase } = await getServerUser();
  const year = new URL(request.url).searchParams.get("year");

  let query = supabase.from("holidays").select("*").order("date");
  if (year) query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ holidays: (data || []).map(mapHolidayRow) });
}

const bodySchema = z.object({ name: z.string().min(1), date: z.string().min(1) });

export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;

  const { data, error } = await supabase.from("holidays").insert({ name: fd.name, date: fd.date }).select("*").single();
  if (error) {
    if (error.message.includes("duplicate key")) return NextResponse.json({ error: `A holiday is already set for ${fd.date}` }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAction(supabase, user.email, `Holiday added: ${fd.name} (${fd.date})`);
  return NextResponse.json({ holiday: mapHolidayRow(data) });
}
