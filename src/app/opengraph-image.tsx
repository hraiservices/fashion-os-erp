import { ImageResponse } from "next/og";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const alt = "Shop logo and name";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Link-preview crawlers (WhatsApp included) time out fast and show no image at all if the
// fetch/render isn't quick — the first version of this route used the cookie-based server
// client (src/lib/supabase/server.ts), whose call to next/headers' cookies() is a Request-time
// API that forces Next to treat the whole route as fully dynamic: re-run the Supabase query AND
// re-render the image from scratch on every single crawl, cold start included, with nothing
// cached in between. This data has no per-user concerns at all (same public pre-login read
// /api/branding/icon already relies on), so a plain anon-key client with no cookie plumbing lets
// Next statically generate this once and revalidate periodically instead, per its own opengraph-
// image docs ("statically optimized ... unless using Request-time APIs or uncached data").
export const revalidate = 3600;

// Every WhatsApp/social link-preview thumbnail was showing the generic app icon (or nothing)
// instead of the shop's own branding — app_settings.shop (name, logoDataUrl) is already readable
// pre-login (the login page itself shows this same logo to a signed-out visitor, see
// /api/branding/icon), so this composes a proper 1200x630 OG image from it rather than leaving
// link previews stuck on placeholder branding. Next.js wires this up to every page under the
// root layout automatically via the opengraph-image file convention — no metadata export needed.
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Fashion Flow";

export default async function Image() {
  const supabase = createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle();
  const shop = data?.value as { name?: string; logoDataUrl?: string | null } | null;
  const shopName = shop?.name || APP_NAME;
  const logoDataUrl = shop?.logoDataUrl;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
          background: "linear-gradient(135deg, #fafafa 0%, #f0f0f2 100%)",
        }}
      >
        {logoDataUrl ? (
          <img src={logoDataUrl} width={200} height={200} style={{ objectFit: "contain", borderRadius: 32 }} alt="" />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 200,
              height: 200,
              borderRadius: 32,
              background: "#18181b",
              color: "#fff",
              fontSize: 96,
              fontWeight: 700,
            }}
          >
            {shopName.trim().charAt(0).toUpperCase() || "F"}
          </div>
        )}
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700, color: "#18181b" }}>{shopName}</div>
        <div style={{ display: "flex", fontSize: 32, color: "#71717a" }}>Tailoring shop management</div>
      </div>
    ),
    { ...size }
  );
}
