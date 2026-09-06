import { createSign } from "crypto";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";

export interface PushPayload {
  title: string;
  body: string;
  /** Path opened when the notification is tapped, e.g. "/dashboard". */
  url?: string;
}

let webPushConfigured = false;
function ensureWebPushConfigured(): boolean {
  if (webPushConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  webPushConfigured = true;
  return true;
}

/** Sends to every Web Push subscription (the plain website and the installed PWA). */
async function sendWebPushToAll(payload: PushPayload): Promise<void> {
  if (!ensureWebPushConfigured()) return;
  const supabase = createServiceClient();
  if (!supabase) return;

  const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (!subs || subs.length === 0) return;

  const body = JSON.stringify(payload);
  const deadIds: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
      } catch (err) {
        // 404/410 = the browser/OS says this subscription is gone for good — prune it so we
        // stop wasting a request on it every time. Any other error (e.g. transient network) is
        // left alone; it'll just fail again next time rather than being deleted prematurely.
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) deadIds.push(sub.id);
      }
    })
  );

  if (deadIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", deadIds);
  }
}

/**
 * FCM's OAuth2 access token, via a self-signed JWT bearer assertion — the standard "service
 * account, no user in the loop" auth flow Google documents for server-to-server APIs. Doing this
 * by hand with Node's built-in `crypto` (RS256-sign a JWT, exchange it at Google's token
 * endpoint) avoids pulling in the full firebase-admin SDK for what is otherwise a single REST
 * call per notification batch. Cached for its ~1hr lifetime so a burst of sends doesn't
 * round-trip to Google for a fresh token every time.
 */
let cachedFcmToken: { token: string; expiresAt: number } | null = null;
async function getFcmAccessToken(): Promise<string | null> {
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;

  if (cachedFcmToken && cachedFcmToken.expiresAt > Date.now() + 60_000) return cachedFcmToken.token;

  const now = Math.floor(Date.now() / 1000);
  const base64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey).toString("base64url");
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedFcmToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedFcmToken.token;
}

/** True once this device's token is either confirmed gone or permanently malformed — matches
 *  FCM v1's error `status` values for those cases (see the API's Status enum reference). */
function isDeadFcmToken(status: number, errorStatus: string | undefined): boolean {
  return status === 404 || errorStatus === "NOT_FOUND" || errorStatus === "UNREGISTERED" || errorStatus === "INVALID_ARGUMENT";
}

/** Sends to every registered device inside the Capacitor (Android/iOS) shell. Silently no-ops
 *  unless a Firebase project's service-account credentials are configured — see the FCM_* env
 *  vars this reads — so a deployment with no Capacitor app built yet needs nothing extra set up. */
async function sendFcmToAll(payload: PushPayload): Promise<void> {
  const projectId = process.env.FCM_PROJECT_ID;
  if (!projectId) return;
  const accessToken = await getFcmAccessToken();
  if (!accessToken) return;

  const supabase = createServiceClient();
  if (!supabase) return;

  const { data: tokens } = await supabase.from("native_push_tokens").select("id, token");
  if (!tokens || tokens.length === 0) return;

  const deadIds: string[] = [];

  await Promise.all(
    tokens.map(async (t) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title: payload.title, body: payload.body },
            ...(payload.url ? { data: { url: payload.url } } : {}),
          },
        }),
      });
      if (res.ok) return;
      const errBody = (await res.json().catch(() => null)) as { error?: { status?: string } } | null;
      if (isDeadFcmToken(res.status, errBody?.error?.status)) deadIds.push(t.id);
    })
  );

  if (deadIds.length > 0) {
    await supabase.from("native_push_tokens").delete().in("id", deadIds);
  }
}

/**
 * Sends a notification to every opted-in device across the whole deployment — both Web Push
 * (the website/PWA) and native/FCM (the Capacitor app) — there's no per-notification targeting
 * concept yet, Phase 1 is "broadcast to everyone who opted in," e.g. the daily briefing. Each
 * transport no-ops independently if its own credentials aren't configured, so this is safe to
 * call from anywhere regardless of which of the two a given deployment has set up.
 */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  await Promise.all([sendWebPushToAll(payload), sendFcmToAll(payload)]);
}
