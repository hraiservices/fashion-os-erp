-- Native push (FCM) registration tokens — the Capacitor-shell counterpart to push_subscriptions
-- (Web Push). One row per device that's registered inside the native Android/iOS app; a user can
-- have several. Written by the browser (src/hooks/use-native-push.ts) once the OS grants
-- notification permission and the native PushNotifications plugin hands back a token; read only
-- by the server-role send path (src/lib/push.ts) — never exposed to other users. Same RLS shape
-- as push_subscriptions for the same reason: sending happens via the service-role client, which
-- bypasses RLS entirely, so no SELECT policy is granted to `authenticated` here.
CREATE TABLE IF NOT EXISTS native_push_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS native_push_tokens_email_idx ON native_push_tokens (email);

ALTER TABLE native_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_native_tokens_insert" ON native_push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (lower(email) = lower(coalesce(auth.jwt()->>'email', '')));

CREATE POLICY "own_native_tokens_delete" ON native_push_tokens
  FOR DELETE TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt()->>'email', '')));
