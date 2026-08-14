-- Phase 1 of Customer Purchase Intelligence: structured product attributes so the future
-- matching engine can compare "did this customer buy this size/color/fabric before" with a
-- plain equality check instead of guessing from free-text category names. Values are
-- constrained to fixed vocabularies at the application layer (src/lib/product-attributes.ts),
-- not via a DB CHECK constraint, so the list can grow without a migration.
--
-- Also adds image_data_url: this app has no Supabase Storage bucket (see src/lib/image-utils.ts
-- — branding images are already stored as resized JPEG data URLs inline), so product photos
-- follow the same established pattern rather than introducing a second storage architecture.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS size           TEXT,
  ADD COLUMN IF NOT EXISTS color          TEXT,
  ADD COLUMN IF NOT EXISTS fabric         TEXT,
  ADD COLUMN IF NOT EXISTS pattern        TEXT,
  ADD COLUMN IF NOT EXISTS occasion       TEXT,
  ADD COLUMN IF NOT EXISTS brand          TEXT,
  ADD COLUMN IF NOT EXISTS image_data_url TEXT;

COMMENT ON COLUMN products.size IS 'One of src/lib/product-attributes.ts PRODUCT_SIZES, or null if not tagged.';
COMMENT ON COLUMN products.color IS 'One of PRODUCT_COLORS, or null if not tagged.';
COMMENT ON COLUMN products.fabric IS 'One of PRODUCT_FABRICS, or null if not tagged.';
COMMENT ON COLUMN products.pattern IS 'One of PRODUCT_PATTERNS, or null if not tagged.';
COMMENT ON COLUMN products.occasion IS 'One of PRODUCT_OCCASIONS, or null if not tagged.';
COMMENT ON COLUMN products.brand IS 'Free text — vendor/brand names have no bounded vocabulary.';
COMMENT ON COLUMN products.image_data_url IS 'Resized JPEG data URL (see fileToDataUrl), same inline-storage pattern as invoice template branding images.';
