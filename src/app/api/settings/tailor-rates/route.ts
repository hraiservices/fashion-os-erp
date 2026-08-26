import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const rateSchema = z.object({ new: z.number().min(0), alteration: z.number().min(0) });
const bodySchema = z.record(z.string(), z.record(z.enum(["s", "h", "f"]), rateSchema));

/**
 * The only sanctioned way to write the tailorRates app_settings key — see
 * add_tailor_rates_lockdown.sql, which blocks a direct app_settings upsert for this key and
 * routes writes through the set_tailor_rates RPC instead. managePayroll-gated here since
 * tailor payable rates are compensation data, unlike the open customer rate card.
 *
 * The RPC itself has no in-SQL permission check (SECURITY DEFINER, so it bypasses RLS on
 * app_settings entirely once called) — it was previously GRANTed to `authenticated`, meaning
 * any logged-in user, including a piece-rate tailor, could call
 * `supabase.rpc('set_tailor_rates', {...})` directly from the browser and inflate their own
 * pay rate, with this route's managePayroll check never in the path at all. EXECUTE is now
 * revoked from `authenticated` (fix_tailor_rates_and_user_roles_rpc_lockdown.sql) and granted
 * only to service_role, so the RPC can only succeed when called from here, through the
 * service-role client, after the check above has already run.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to save tailor rates (missing service role key)" }, { status: 501 });

  const { error } = await serviceClient.rpc("set_tailor_rates", { p_value: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
