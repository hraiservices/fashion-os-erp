import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { downloadProductImage } from "@/lib/supabase/product-media-storage";
import { isMigratedMediaPath } from "@/lib/supabase/media-resolve";

/**
 * Serves a product's photo as a real image response at a stable, publicly reachable URL.
 * Exists solely so the WhatsApp Business Cloud API — which requires media to be fetched from
 * a public HTTPS URL, not a data URI — can attach a product photo to an outbound message.
 *
 * The photo is either a legacy base64 data URL still stored directly on the product row (see
 * image-utils.ts / add_product_variant_attributes.sql), which this route decodes, or, since the
 * product-media Storage migration, a Storage object path (see
 * src/lib/supabase/product-media-storage.ts), which this route downloads server-side and
 * re-serves — a redirect to a signed URL isn't used here since WhatsApp's media fetcher isn't
 * guaranteed to follow one.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const { data } = await supabase.from("products").select("image_data_url").eq("id", id).maybeSingle();
  const stored = data?.image_data_url;
  if (!stored) return NextResponse.json({ error: "No image" }, { status: 404 });

  if (isMigratedMediaPath(stored)) {
    const blob = await downloadProductImage(supabase, stored);
    if (!blob) return NextResponse.json({ error: "No image" }, { status: 404 });
    const bytes = Buffer.from(await blob.arrayBuffer());
    return new NextResponse(bytes, {
      headers: { "Content-Type": blob.type || "image/jpeg", "Cache-Control": "public, max-age=3600" },
    });
  }

  const match = /^data:(image\/\w+);base64,(.+)$/.exec(stored);
  if (!match) return NextResponse.json({ error: "Malformed image" }, { status: 500 });
  const [, mimeType, base64] = match;

  return new NextResponse(Buffer.from(base64, "base64"), {
    headers: { "Content-Type": mimeType, "Cache-Control": "public, max-age=3600" },
  });
}
