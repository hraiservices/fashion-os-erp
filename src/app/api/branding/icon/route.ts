import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { createClient } from "@/lib/supabase/server";

const FALLBACK_SVG_PATH = path.join(process.cwd(), "public", "icon.svg");

/**
 * Browser tab icon (favicon) — serves the shop's own uploaded logo (Settings → Shop,
 * app_settings.shop.logoDataUrl) once one is set, falling back to the default scissors icon
 * otherwise. Referenced as a plain static path in metadata.icons (src/app/layout.tsx), so the
 * page's own render stays static/fast — only the browser's separate favicon request hits this
 * route. app_settings is already readable pre-login (the login page itself shows this same
 * logo to a signed-out visitor), so no auth check is needed here.
 */
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle();
  const logoDataUrl = (data?.value as { logoDataUrl?: string | null } | null)?.logoDataUrl;

  if (logoDataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(logoDataUrl);
    if (match) {
      const [, mimeType, base64] = match;
      const bytes = Buffer.from(base64, "base64");
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=300, must-revalidate",
        },
      });
    }
  }

  const svg = await readFile(FALLBACK_SVG_PATH, "utf8");
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300, must-revalidate",
    },
  });
}
