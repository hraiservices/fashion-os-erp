import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { createClient } from "@/lib/supabase/server";

const FALLBACK_SVG_PATH = path.join(process.cwd(), "public", "icon.svg");

/**
 * Browser tab icon (favicon) — serves the shop's own uploaded favicon (Settings → Personalize,
 * app_settings.shop.faviconDataUrl) once one is set, falling back to the shop logo, then the
 * default scissors icon. Referenced as a plain static path in metadata.icons
 * (src/app/layout.tsx), so the page's own render stays static/fast — only the browser's
 * separate favicon request hits this route. app_settings is already readable pre-login (the
 * login page itself shows this same logo to a signed-out visitor), so no auth check is needed
 * here.
 */
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle();
  const shop = data?.value as { logoDataUrl?: string | null; faviconDataUrl?: string | null } | null;
  const iconDataUrl = shop?.faviconDataUrl || shop?.logoDataUrl;

  if (iconDataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(iconDataUrl);
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

    // Since the branding-media Storage migration (src/lib/supabase/branding-storage.ts),
    // logoDataUrl/faviconDataUrl is a real https:// URL for any shop that's re-saved its
    // branding — the regex above only ever matched the legacy base64 shape, so a migrated
    // shop's custom icon was silently falling all the way through to the generic scissors SVG
    // below. Proxy it through instead of redirecting: a redirect would still work for a browser
    // tab, but this route is also what social link-preview crawlers resolve, and some of those
    // don't reliably follow redirects for favicon/icon fetches.
    if (iconDataUrl.startsWith("https://")) {
      try {
        const upstream = await fetch(iconDataUrl, { signal: AbortSignal.timeout(5000) });
        if (upstream.ok) {
          const bytes = await upstream.arrayBuffer();
          return new NextResponse(bytes, {
            headers: {
              "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
              "Cache-Control": "public, max-age=300, must-revalidate",
            },
          });
        }
      } catch {
        // Falls through to the generic icon below — same "never break the tab icon" fallback
        // the base64 path already had.
      }
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
