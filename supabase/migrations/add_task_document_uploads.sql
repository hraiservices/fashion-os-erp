-- Lets a task or project Document be an actual uploaded file (PDF, photo, office doc), not just a
-- pasted link. Same two-step pattern as lead attachments (add_lead_attachments.sql): the browser
-- gets a signed upload URL, uploads straight to Storage, then registers the file against
-- work_documents. `url` stays for pasted links; an uploaded file instead fills `path` (its
-- location in Storage) and the API hands out a short-lived signed URL for it at read time.

ALTER TABLE work_documents ADD COLUMN IF NOT EXISTS path TEXT;
ALTER TABLE work_documents ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE work_documents ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
ALTER TABLE work_documents ALTER COLUMN url DROP NOT NULL;

-- 25 MB per file, same limit as lead-media.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('task-documents', 'task-documents', false, 26214400)
ON CONFLICT (id) DO NOTHING;
