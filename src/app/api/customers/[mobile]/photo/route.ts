import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadCustomerPhoto, deleteCustomerPhoto } from "@/lib/supabase/customer-photo-storage";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({ dataUrl: z.string().min(1) });

/** POST a base64 image data: URL — uploads it to the customer-photos bucket and stores the new
 *  path on customers.photo_path, replacing (and cleaning up) any previous photo. Needs
 *  supabase/migrations/add_customer_activity_log_photo.sql run first — until then the
 *  photo_path update below fails and this returns 501 rather than silently losing the upload. */
export async function POST(request: Request, { params }: { params: Promise<{ mobile: string }> }) {
  const { mobile } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageCustomers) return NextResponse.json({ error: "No permission to manage customers" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid photo data" }, { status: 400 });

  const { data: existing } = await db.from("customers").select("*").eq("mobile", mobile).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const previousPath = (existing as unknown as { photo_path?: string | null }).photo_path;

  let path: string;
  try {
    path = await uploadCustomerPhoto(db, mobile, parsed.data.dataUrl);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
  }

  const { error } = await db.from("customers").update({ photo_path: path } as never).eq("mobile", mobile);
  if (error) {
    await deleteCustomerPhoto(db, path);
    return NextResponse.json({ error: "Couldn't save — has the customer-photo SQL been run?" }, { status: 501 });
  }

  if (previousPath) await deleteCustomerPhoto(db, previousPath);
  await logAction(supabase, user.email, `📷 Photo updated for customer ${mobile}`, null, null, mobile);

  const { data: signed } = await db.storage.from("customer-photos").createSignedUrl(path, 3600);
  return NextResponse.json({ path, url: signed?.signedUrl || null });
}
