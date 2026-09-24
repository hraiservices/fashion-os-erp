import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveGalleryImageUrls } from "@/lib/supabase/whatsapp-gallery-storage";

/** Public, unauthenticated — no session, no RLS, reads straight through the service client, same
 *  posture as /track/[token]. Signed URLs are minted fresh on every request (never cached
 *  server-side), so this works for og:image previews and for someone opening the link directly,
 *  well past the 1-hour signed-URL TTL. */
async function loadGallery(token: string) {
  const db = createServiceClient();
  if (!db) return null;

  const { data: gallery } = await db.from("whatsapp_gallery_links").select("title, image_paths").eq("token", token).maybeSingle();
  if (!gallery) return null;

  const { data: shopSetting } = await db.from("app_settings").select("value").eq("key", "shop").maybeSingle();
  const shop = (shopSetting?.value as { name?: string; logoDataUrl?: string } | null) || null;

  const imageUrls = await resolveGalleryImageUrls(db, gallery.image_paths);
  return { title: gallery.title, imageUrls: imageUrls.filter(Boolean), shopName: shop?.name, shopLogoDataUrl: shop?.logoDataUrl };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const gallery = await loadGallery(token);
  if (!gallery) return { title: "Photos" };

  const title = gallery.title || (gallery.shopName ? `Photos from ${gallery.shopName}` : "Photos");
  const description = `${gallery.imageUrls.length} photo${gallery.imageUrls.length === 1 ? "" : "s"} shared with you`;
  const firstImage = gallery.imageUrls[0];

  return {
    title,
    description,
    // WhatsApp (and every other chat app) reads these to render the link-preview card with a
    // thumbnail — this is the entire point of the link approach: no API needed to get the same
    // rich preview a normal person-to-person shared photo link gets.
    openGraph: firstImage ? { title, description, images: [{ url: firstImage }] } : { title, description },
  };
}

export default async function WhatsAppGalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gallery = await loadGallery(token);
  if (!gallery) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 py-8 sm:p-6">
      <div className="flex items-center gap-3">
        {gallery.shopLogoDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL from shop settings, not an optimizable remote image
          <img src={gallery.shopLogoDataUrl} alt={gallery.shopName || "Shop logo"} className="size-11 shrink-0 rounded-lg border bg-white object-contain" />
        )}
        <h1 className="text-lg font-semibold">{gallery.title || gallery.shopName || "Photos"}</h1>
      </div>

      {gallery.imageUrls.length === 0 ? (
        <p className="text-sm text-muted-foreground">This link has expired or its photos are no longer available.</p>
      ) : (
        <div className="space-y-3">
          {gallery.imageUrls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed Storage URL, not an app asset next/image can cache/optimize
            <img key={i} src={url} alt={`Photo ${i + 1}`} className="w-full rounded-xl border" />
          ))}
        </div>
      )}

      {gallery.shopName && <p className="pt-2 text-center text-xs text-muted-foreground">{gallery.shopName}</p>}
    </div>
  );
}
