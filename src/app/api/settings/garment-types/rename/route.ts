import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({
  oldType: z.string().trim().min(1),
  newType: z.string().trim().min(1),
});

/**
 * Renames a garment type everywhere it's used as a plain string key/value — the customer rate
 * card, fabric usage settings, every tailor payable rate version (current and historical), and
 * the `type` field inside every existing order's garments. See rename_garment_type() in
 * add_rename_garment_type_rpc.sql for the actual cascade; gated on managePayroll since it
 * rewrites payroll (tailor rate) history, not just the open customer rate card.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to rename garment types" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  if (parsed.data.oldType === parsed.data.newType) return NextResponse.json({ error: "New name is the same as the current name" }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured to rename garment types (missing service role key)" }, { status: 501 });

  const { data, error } = await serviceClient.rpc("rename_garment_type", {
    p_old: parsed.data.oldType,
    p_new: parsed.data.newType,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, ordersUpdated: data as number });
}
