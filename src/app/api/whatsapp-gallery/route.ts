import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadGalleryImage } from "@/lib/supabase/whatsapp-gallery-storage";

const bodySchema = z.object({
  images: z.array(z.string().startsWith("data:image/")).min(1).max(10),
  title: z.string().max(200).optional(),
});

/**
 * Creates a public, shareable link for one or more images — the "upload once, get a link"
 * step Bulk WhatsApp with Image needs so a customer sees a real photo-preview thumbnail when the
 * link lands in their chat, without ever touching the WhatsApp API (see
 * add_whatsapp_gallery_links.sql's own comment for why a link does this and a raw image attach
 * can't be automated at all). manageCustomers-gated, same permission as the bulk-send page itself.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.manageCustomers) return NextResponse.json({ error: "No permission to message customers" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });

  const token = randomUUID().replace(/-/g, "");
  let imagePaths: string[];
  try {
    imagePaths = await Promise.all(parsed.data.images.map((img) => uploadGalleryImage(serviceClient, token, img)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to upload image(s)" }, { status: 500 });
  }

  const { error } = await serviceClient.from("whatsapp_gallery_links").insert({
    token,
    title: parsed.data.title || null,
    image_paths: imagePaths,
    created_by: user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = new URL(`/g/${token}`, request.url).toString();
  return NextResponse.json({ token, url });
}
