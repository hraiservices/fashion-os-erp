-- Lead WhatsApp files: photos, voice notes, designs and PDFs that a lead sends on WhatsApp can be
-- attached to the lead, and a WhatsApp chat can be pasted into its history.
--
-- Files live in a PRIVATE Storage bucket ('lead-media'). Nobody reads it directly: the
-- /api/targets/leads/[id]/attachments routes check the caller can see the lead, then hand out
-- short-lived signed URLs (service-role client). The browser uploads straight to Storage through
-- a signed upload URL the same route mints, so large photos and audio do not go through the
-- serverless request-body limit.

CREATE TABLE IF NOT EXISTS lead_attachments (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'file' CHECK (kind IN ('image', 'audio', 'video', 'file')),
  name          TEXT NOT NULL DEFAULT '',
  path          TEXT NOT NULL,
  content_type  TEXT NOT NULL DEFAULT '',
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_attachments_lead ON lead_attachments (lead_id, created_at DESC);

ALTER TABLE lead_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON lead_attachments;
CREATE POLICY "service_role_all" ON lead_attachments
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 25 MB per file. Types are checked by the API; the bucket itself accepts anything WhatsApp sends.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lead-media', 'lead-media', false, 26214400)
ON CONFLICT (id) DO NOTHING;

-- A pasted WhatsApp chat shows in the lead's history as its own kind.
ALTER TABLE lead_activities DROP CONSTRAINT IF EXISTS lead_activities_kind_check;
ALTER TABLE lead_activities
  ADD CONSTRAINT lead_activities_kind_check
  CHECK (kind IN ('note', 'call', 'meeting', 'stage_change', 'whatsapp'));
