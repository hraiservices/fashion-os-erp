import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { aiErrorResponse, aiImage } from "@/lib/ai-assist";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_BYTES = 3 * 1024 * 1024;
const dataUrl = z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Send a JPEG, PNG or WebP photo");
const bodySchema = z.object({ person: dataUrl, design: dataUrl, consent: z.literal(true, { message: "The customer must agree to a preview first" }), notes: z.string().trim().max(200).optional() });

const split = (u: string) => {
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(u)!;
  return { mimeType: m[1], data: m[2] };
};

/**
 * POST — an EXPERIMENTAL "how it might look" preview: a customer's photo plus a design photo in, one generated picture
 * out. Nothing is stored — the photos are passed to the AI and the result goes straight back. Staff only, and only
 * after the customer has agreed. The picture is a rough impression, never a promise of the final garment.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.addOrder) return NextResponse.json({ error: "You don't have permission to do that" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
  const person = split(parsed.data.person);
  const design = split(parsed.data.design);
  if (Buffer.byteLength(person.data, "base64") > MAX_BYTES || Buffer.byteLength(design.data, "base64") > MAX_BYTES) return NextResponse.json({ error: "Those photos are too large — use smaller photos" }, { status: 400 });
  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });
  try {
    const out = await aiImage(
      serviceClient,
      "tryon",
      `The first image is a customer's photo. The second image is a garment design they like. Make one realistic preview of the customer wearing that garment design, keeping their face, body shape, skin tone, pose and the background unchanged. Show the garment's colour, neckline, sleeves and embroidery as in the design photo. Do not add text, logos or watermarks.${parsed.data.notes ? ` Extra notes from the shop: ${parsed.data.notes}` : ""}`,
      [person, design],
      user.email
    );
    return NextResponse.json({ image: `data:${out.mimeType};base64,${out.data}` });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
