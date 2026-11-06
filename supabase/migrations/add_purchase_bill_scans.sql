-- Upload a PDF/photo of a vendor bill and have AI pre-fill the New Bill form (vendor, dates,
-- line items, tax, totals) instead of typing it all by hand. The uploaded file is kept attached
-- to the bill afterward so the original scan can always be pulled up again.
--
-- Files live in a PRIVATE Storage bucket ('bill-scans'). The /api/purchases/bills/scan route
-- (service-role) uploads the file there itself (no client-side signed-upload step — a single bill
-- scan is small enough to pass through the request body, unlike the lead-media flow's photos/voice
-- notes) and hands back its path; /api/purchases/bills/[id]/scan-url mints a short-lived signed URL
-- for viewing it from the bill detail page.

ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS scan_path TEXT;

-- 10 MB per file — a single-page photo or PDF comfortably fits; the API itself caps the upload
-- well under this so it never relies on the bucket limit alone.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('bill-scans', 'bill-scans', false, 10485760)
ON CONFLICT (id) DO NOTHING;
