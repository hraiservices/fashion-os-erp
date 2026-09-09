import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const rateSchema = z.object({ new: z.number().min(0), alteration: z.number().min(0) });
const ratesSchema = z.record(z.string(), z.record(z.enum(["s", "h", "f"]), rateSchema));
const bodySchema = z.object({
  rates: ratesSchema,
  // YYYY-MM-DD — the date the payroll manager picked in the "Select the date from which these
  // updates will apply" confirmation, not necessarily today.
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveFrom must be YYYY-MM-DD"),
});

/**
 * The only sanctioned way to write a tailor rate version — see add_tailor_rate_versions.sql,
 * which routes writes through the set_tailor_rates_versioned RPC (SECURITY DEFINER, granted to
 * service_role only, never `authenticated`) exactly like the flat tailorRates key was locked
 * down before it. managePayroll-gated here since tailor payable rates are compensation data,
 * unlike the open customer rate card.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to save tailor rates (missing service role key)" }, { status: 501 });

  const { error } = await serviceClient.rpc("set_tailor_rates_versioned", {
    p_rates: parsed.data.rates,
    p_effective_from: parsed.data.effectiveFrom,
    p_created_by: user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/** Full version history for the Settings UI — current and any scheduled/past changes. */
export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to manage payroll" }, { status: 403 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured (missing service role key)" }, { status: 501 });

  const { data, error } = await serviceClient
    .from("tailor_rate_versions")
    .select("id, rates, effective_from, created_by, created_at")
    .order("effective_from", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date().toISOString().slice(0, 10);
  const versions = (data || []).map((v) => ({
    id: v.id,
    rates: v.rates,
    effectiveFrom: v.effective_from,
    createdBy: v.created_by,
    createdAt: v.created_at,
    isPending: v.effective_from > today,
  }));

  return NextResponse.json({ versions });
}
