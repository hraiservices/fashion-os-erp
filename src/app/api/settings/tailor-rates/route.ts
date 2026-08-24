import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";

const rateSchema = z.object({ new: z.number().min(0), alteration: z.number().min(0) });
const bodySchema = z.record(z.string(), z.record(z.enum(["s", "h", "f"]), rateSchema));

/**
 * The only sanctioned way to write the tailorRates app_settings key — see
 * add_tailor_rates_lockdown.sql, which blocks a direct app_settings upsert for this key and
 * routes writes through the set_tailor_rates RPC instead. managePayroll-gated here since
 * tailor payable rates are compensation data, unlike the open customer rate card.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { error } = await supabase.rpc("set_tailor_rates", { p_value: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
