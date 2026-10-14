import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import path from "path";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SIZES = new Set([180, 192, 512]);
/** Share of the canvas the logo may use. Launchers crop installed-app icons to a circle/squircle and only
 *  promise the central ~80% survives; a wide wordmark filling the canvas (as the default logo does) lost
 *  its left and right edges. 72% keeps even the corners of a wide logo inside that safe zone. */
const LOGO_SHARE = 0.72;

async function toDataUrl(src: string): Promise<string | null> {
  if (src.startsWith("data:")) return src;
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/png";
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * The home-screen icon: the shop's logo (or the default Fashion Flow logo) centred on white with a margin, so
 * the launcher's mask never cuts into it. Used for the manifest's maskable icons and the iOS touch icon; the
 * plain browser-tab favicon stays at /api/branding/icon.
 */
export async function GET(req: NextRequest) {
  const requested = Number(req.nextUrl.searchParams.get("size"));
  const size = SIZES.has(requested) ? requested : 512;

  let logo: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle();
    const shop = data?.value as { logoDataUrl?: string | null; faviconDataUrl?: string | null } | null;
    const custom = shop?.faviconDataUrl || shop?.logoDataUrl;
    if (custom) logo = await toDataUrl(custom);
  } catch {
    // fall through to the default logo
  }
  if (!logo) {
    const bytes = await readFile(path.join(process.cwd(), "public", "icon-512.png"));
    logo = `data:image/png;base64,${bytes.toString("base64")}`;
  }

  const inner = Math.round(size * LOGO_SHARE);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        <img src={logo} width={inner} height={inner} style={{ objectFit: "contain" }} alt="" />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=300, must-revalidate" } }
  );
}
