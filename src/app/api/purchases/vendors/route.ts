import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  mobile: z.string().default(""),
  email: z.string().default(""),
  gstin: z.string().default(""),
  state: z.string().default(""),
  address: z.string().default(""),
  notes: z.string().default(""),
});

/**
 * Create/update a vendor.
 *
 * Previously ran entirely client-side (useSaveVendor called db.from("vendors").upsert
 * directly) with no permission check at all — any authenticated user, including roles with
 * managePurchases explicitly set to false, could create or rewrite vendor records.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePurchases) return NextResponse.json({ error: "No permission to manage vendors" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  const isNew = !fd.id;

  const { data, error } = await db
    .from("vendors")
    .upsert({
      id: fd.id,
      name: fd.name.trim(),
      mobile: fd.mobile.trim(),
      email: fd.email.trim(),
      gstin: fd.gstin.trim(),
      state: fd.state.trim(),
      address: fd.address.trim(),
      notes: fd.notes.trim(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, isNew ? `Vendor added: ${fd.name}` : `Vendor updated: ${fd.name}`);
  return NextResponse.json({ vendor: data });
}
