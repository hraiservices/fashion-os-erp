import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  address: z.string().default(""),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
});

/** Create/update a warehouse. Previously ran entirely client-side with no permission check. */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageInventory) return NextResponse.json({ error: "No permission to manage inventory" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  const isNew = !fd.id;

  if (fd.isDefault) {
    await db.from("warehouses").update({ is_default: false }).neq("id", fd.id || "");
  }

  const { data, error } = await db
    .from("warehouses")
    .upsert({
      id: fd.id,
      name: fd.name.trim(),
      address: fd.address.trim(),
      is_default: fd.isDefault,
      active: fd.active,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, isNew ? `Warehouse added: ${fd.name}` : `Warehouse updated: ${fd.name}`);
  return NextResponse.json({ warehouse: data });
}
