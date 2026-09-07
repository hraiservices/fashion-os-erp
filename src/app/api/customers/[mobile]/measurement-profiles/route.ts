import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAction } from "@/lib/logging";
import { getProfiles, renameProfile, setArchived, setDefaultProfile, toJson } from "@/lib/measurement-profiles";

const patchSchema = z.union([
  z.object({ action: z.literal("rename"), id: z.string().min(1), name: z.string().min(1) }),
  z.object({ action: z.literal("archive"), id: z.string().min(1), archived: z.boolean() }),
  z.object({ action: z.literal("setDefault"), id: z.string().min(1) }),
]);

/**
 * Rename/archive/set-default a customer's saved measurement profile — the profiles themselves
 * are otherwise only ever written from the order form (see /api/orders and /api/orders/[id]),
 * which upserts values into a profile as part of saving an order. This endpoint covers the
 * management actions that don't happen from that flow.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageCustomers) return NextResponse.json({ error: "No permission to manage customers" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const body = parsed.data;

  const { data: customer, error: lookupError } = await db
    .from("customers")
    .select("id, measurements, measurement_profiles, created_at")
    .eq("mobile", mobile)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const profiles = getProfiles({
    measurements: (customer.measurements as Record<string, unknown>) || {},
    measurementProfiles: Array.isArray(customer.measurement_profiles) ? (customer.measurement_profiles as never) : [],
    createdAt: customer.created_at,
  });

  const nextProfiles =
    body.action === "rename"
      ? renameProfile(profiles, body.id, body.name)
      : body.action === "archive"
        ? setArchived(profiles, body.id, body.archived)
        : setDefaultProfile(profiles, body.id);

  const { error } = await db.from("customers").update({ measurement_profiles: toJson(nextProfiles) }).eq("id", customer.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `📏 Measurement profile ${body.action} for ${mobile}`, null, body.id);

  return NextResponse.json({ profiles: nextProfiles });
}
