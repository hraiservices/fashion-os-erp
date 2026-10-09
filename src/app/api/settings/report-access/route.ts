import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { REPORTS_GROUP } from "@/components/app-shell/nav-config";
import { logAction } from "@/lib/logging";

const reportHrefSchema = z.enum(REPORTS_GROUP.children.map((c) => c.href) as [string, ...string[]]);
// partialRecord (not record) — the client only ever sends the roles/reports someone has
// actually toggled off, never every role × every report. Same reasoning as role-defaults.
const bodySchema = z.partialRecord(z.enum(["admin", "manager", "sales", "tailor"]), z.partialRecord(reportHrefSchema, z.boolean()));

/**
 * The only sanctioned way to write the reportRoleAccess app_settings key — see
 * add_report_role_access_lockdown.sql, which blocks a direct app_settings upsert for this key
 * and routes writes through the set_report_role_access RPC instead (granted to service_role
 * only). Exactly as sensitive as /api/settings/role-defaults: it controls what an entire role
 * can see app-wide, not one person.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await getServerUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!user.perms.manageUsers) return NextResponse.json({ error: "No permission to manage users" }, { status: 403 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

    const serviceClient = createServiceClient();
    if (!serviceClient) return NextResponse.json({ error: "Server is not configured to manage users (missing service role key)" }, { status: 501 });

    // Cast needed until database.types.ts is regenerated after the migration below is run —
    // same situation every brand-new RPC is in before that regeneration (see role-defaults).
    const { error } = await (serviceClient.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(
      "set_report_role_access",
      { p_value: parsed.data }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAction(supabase, user.email, "Report access permissions updated");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected server error" }, { status: 500 });
  }
}
