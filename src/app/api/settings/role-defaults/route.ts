import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { PERMISSION_LABELS } from "@/lib/permissions";
import { logAction } from "@/lib/logging";

const permissionKeySchema = z.enum(Object.keys(PERMISSION_LABELS) as [string, ...string[]]);
const bodySchema = z.record(z.enum(["admin", "manager", "sales", "tailor"]), z.record(permissionKeySchema, z.boolean()));

/**
 * The only sanctioned way to write the roleDefaultOverrides app_settings key — see
 * add_role_default_overrides_lockdown.sql, which blocks a direct app_settings upsert for this
 * key and routes writes through the set_role_default_overrides RPC instead (granted to
 * service_role only, exactly like set_tailor_rates — this is just as sensitive: it controls
 * what an entire role can do app-wide, not one person).
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage users (missing service role key)" }, { status: 501 });

  // Cast needed until someone regenerates database.types.ts after running the migration below
  // (set_role_default_overrides doesn't exist in the DB yet at the time this route is written,
  // so the generated Functions union doesn't know it either — same situation any brand-new RPC
  // is in before that regeneration, e.g. set_tailor_rates originally).
  const rpc = serviceClient.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  const { error } = await rpc("set_role_default_overrides", { p_value: parsed.data });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, "Role default permissions updated");
  return NextResponse.json({ ok: true });
}
