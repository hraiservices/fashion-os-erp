-- Append-only audit log of received Razorpay webhook events — purely for debugging a "why did
-- my module turn off" dispute later. Not required for the entitlement-toggle logic itself, which
-- lives entirely in src/app/api/webhooks/razorpay/route.ts and writes straight to the
-- moduleEntitlements app_settings row via the service-role client.
CREATE TABLE IF NOT EXISTS billing_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  razorpay_payload jsonb NOT NULL,
  processed_at timestamptz DEFAULT now()
);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Reads go through the normal authenticated app (so you can review history in the app or via
-- the Supabase table editor); writes only ever come from the webhook route, which uses the
-- service-role key and therefore bypasses RLS entirely — no INSERT policy is needed or granted
-- to `authenticated`.
CREATE POLICY "authenticated_read" ON billing_events
  FOR SELECT TO authenticated
  USING (true);
