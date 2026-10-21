-- Lead Type: one shop-editable category per lead (Settings > Leads), so an App Sale or
-- Referral / Partner lead can be told apart from the default stitching-customer lead. Nullable
-- and unconstrained on purpose — the list of valid types lives in app_settings (key "leadTypes")
-- and is editable from Settings without a migration, so a CHECK constraint here would fight that.
-- Existing leads are left NULL ("not set") rather than backfilled to a default.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_lead_type ON leads (lead_type);
