-- Bulk WhatsApp with Image, take 2 — no WhatsApp API for sending (see the /crm/bulk-whatsapp
-- page's own comment), so instead of asking someone to manually attach an image inside every
-- opened chat, they upload the image(s) once here and get back a public link. Pasted into a
-- normal WhatsApp text message (via the wa.me pre-filled caption, same as every other click-to-
-- chat link in this app), WhatsApp's own client fetches this link's Open Graph tags and renders
-- a real photo-preview card — the same behavior any person-to-person shared link gets, no API
-- needed for that part either.
--
-- Private bucket, same lockdown as order-media/product-media/employee-media — every image read
-- goes through a short-lived signed URL minted server-side (see
-- src/lib/supabase/whatsapp-gallery-storage.ts), both for the public page's <img> tags and for
-- its generateMetadata og:image, never a direct client fetch.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('whatsapp-gallery', 'whatsapp-gallery', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS whatsapp_gallery_links (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  token        TEXT        NOT NULL UNIQUE,
  title        TEXT,
  image_paths  TEXT[]      NOT NULL,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- No `authenticated` policy at all — the public page (src/app/g/[token]/page.tsx) is
-- unauthenticated by design (a customer opening it has no login), so it reads through the
-- service-role client exactly like get_customer_order_status()'s own page does, never via RLS.
ALTER TABLE whatsapp_gallery_links ENABLE ROW LEVEL SECURITY;
