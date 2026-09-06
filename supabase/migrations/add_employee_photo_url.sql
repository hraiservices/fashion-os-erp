-- Employee profile photo, shown on the Employee form and after a linked login signs into the
-- dashboard (the topbar avatar). Stored the same way order attachment photos are — a base64
-- data URL in a text column, downsized client-side before upload (see src/lib/media.ts) — since
-- this schema has no Supabase Storage bucket to put an actual file in.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url text;
