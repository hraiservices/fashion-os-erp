import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";

export interface PushPayload {
  title: string;
  body: string;
  /** Path opened when the notification is tapped, e.g. "/dashboard". */
  url?: string;
}

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * Sends a Web Push notification to every subscribed device across the whole deployment (there's
 * no per-notification targeting concept yet — Phase 1 is "broadcast to everyone who opted in,"
 * e.g. the daily briefing). Silently no-ops if VAPID env vars aren't configured, so this is safe
 * to call from anywhere without every deployment needing push set up.
 */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
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
