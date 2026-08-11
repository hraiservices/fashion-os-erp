-- Web Push subscriptions — one row per device a user has opted into notifications on (a user
-- can have several, e.g. phone + laptop). Written by the browser (via src/hooks/use-push-notifications.ts)
-- when the user grants notification permission; read only by the server-role send path
-- (src/lib/push.ts) — never exposed to other users.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_email_idx ON push_subscriptions (email);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A user may only manage their own subscriptions (matched on their login email) — never see or
-- touch anyone else's device tokens. Sending pushes happens server-side via the service-role
-- client (src/lib/supabase/service.ts), which bypasses RLS entirely, so no SELECT policy is
-- granted to `authenticated` here.
CREATE POLICY "own_subscriptions_insert" ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (lower(email) = lower(coalesce(auth.jwt()->>'email', '')));

CREATE POLICY "own_subscriptions_delete" ON push_subscriptions
  FOR DELETE TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt()->>'email', '')));
