import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Serves a product's photo as a real image response at a stable, publicly reachable URL.
 * Exists solely so the WhatsApp Business Cloud API — which requires media to be fetched from
 * a public HTTPS URL, not a data URI — can attach a product photo to an outbound message. The
 * image itself is still stored as a data URL on the product row (see image-utils.ts /
 * add_product_variant_attributes.sql); this route just decodes and re-serves it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const { data } = await supabase.from("products").select("image_data_url").eq("id", id).maybeSingle();
  const dataUrl = data?.image_data_url;
  if (!dataUrl) return NextResponse.json({ error: "No image" }, { status: 404 });

  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) return NextResponse.json({ error: "Malformed image" }, { status: 500 });
  const [, mimeType, base64] = match;

  return new NextResponse(Buffer.from(base64, "base64"), {
    headers: { "Content-Type": mimeType, "Cache-Control": "public, max-age=3600" },
  });
}
