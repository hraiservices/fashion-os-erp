import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  address: z.string().default(""),
  latitude: z.number(),
  longitude: z.number(),
  geofenceRadiusM: z.number().min(0),
  active: z.boolean().default(true),
});

/**
 * Create/update a shop location used for attendance geofencing. Previously ran entirely
 * client-side with no permission check — any authenticated user could move/disable the
 * geofence a check-in relies on.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageEmployees) return NextResponse.json({ error: "No permission to manage employees" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const fd = parsed.data;
  const isNew = !fd.id;

  const { data, error } = await db
    .from("shop_locations")
    .upsert({
      id: fd.id,
      name: fd.name.trim(),
      address: fd.address.trim(),
      latitude: fd.latitude,
      longitude: fd.longitude,
      geofence_radius_m: fd.geofenceRadiusM,
      active: fd.active,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, isNew ? `Shop location added: ${fd.name}` : `Shop location updated: ${fd.name}`);
  return NextResponse.json({ location: data });
}
