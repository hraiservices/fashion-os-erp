import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { isRestrictedRole } from "@/lib/permissions";
import { createServiceClient } from "@/lib/supabase/service";
import { migrateBrandingImage } from "@/lib/supabase/branding-storage";

const bodySchema = z.object({
  key: z.enum(["logo", "favicon"]),
  dataUrl: z.string().startsWith("data:"),
});

/**
 * Uploads a shop logo/favicon (sent as a client-resized base64 data URL, see
 * src/lib/image-utils.ts) to the branding-media Storage bucket and returns its public URL —
 * ShopSection swaps the data URL for this URL before calling the normal app_settings save, so
 * the ~100-300KB of base64 image text that used to ride along on every useShopSettings() fetch
 * (the app shell, login/signup pages, every PDF/report) is replaced with a short URL string.
 * Same non-restricted-role gate as the Personalize page's Company Profile section
 * (canManageShop = !user?.restricted) — this route doesn't itself touch app_settings, so no
 * further permission split is needed.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (isRestrictedRole(user.role)) return NextResponse.json({ error: "No permission to manage company settings" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });

  try {
    const url = await migrateBrandingImage(db, parsed.data.key, parsed.data.dataUrl);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
  }
}
