# Mobile App — Phase 1 (PWA)

Fashion Flow is now installable on Android (and desktop Chrome) as a Progressive Web App: a
real home-screen icon, full-screen app-like display, an offline fallback for already-visited
screens, and push notifications — all through the browser, no Play Store, no cost.

## What shipped

- **Install button** — already existed (`src/components/app-shell/pwa-installer.tsx`), now
  actually wired up correctly. Shows "Install" in the topbar once the browser signals the app is
  installable; installing gives a real home-screen icon that opens full-screen.
- **Service worker** (`public/sw.js`) — caches the app shell so already-loaded screens keep
  working with no connection, and now also handles incoming push notifications.
- **Push notifications** — opt in per device from **Settings → Account → Push notifications**.
  Currently wired into one real event: the AI daily briefing (whoever has notifications enabled
  gets it pushed to their phone/desktop the moment it's generated, on top of the existing in-app
  notification bell).

## One-time setup per deployment

1. **Run the migration**: `supabase/migrations/add_push_subscriptions.sql` in that project's
   Supabase SQL editor.
2. **Set the Web Push env vars** (`.env.local` and Vercel):
   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
   VAPID_PRIVATE_KEY=<private key>
   VAPID_SUBJECT=mailto:you@example.com
   ```
   Generate a keypair for free with `npx web-push generate-vapid-keys` — every deployment can
   reuse the same pair or generate its own, either is fine, they're not customer-specific secrets
   the way the Supabase service-role key is.
3. Redeploy. Without these three vars, push notifications silently no-op everywhere (nothing
   breaks, they just don't fire) — everything else in Phase 1 works regardless.

## Adding push to another event

`src/lib/push.ts` exports `sendPushToAll({ title, body, url })` — call it anywhere server-side
(a mutation route, a cron job) the same way `src/app/api/ai/daily-briefing/route.ts` does. It's a
broadcast to every opted-in device right now, not per-user targeting — fine for Phase 1's single
use case, but worth knowing before wiring up something that should only reach one person (e.g. a
payment reminder) rather than everyone.

## Manual test checklist

- **Install**: open the app in Chrome on an Android phone, tap "Install" in the topbar, confirm
  it lands on the home screen and opens full-screen (no browser address bar).
- **Offline**: with the app installed and a few screens already visited, turn on airplane mode,
  reopen the app — already-visited screens should still load instead of a browser error page.
- **Push**: enable notifications in Settings → Account, trigger the daily briefing (or call
  `sendPushToAll` manually once to test), confirm a real OS-level notification arrives and
  tapping it opens the app to the right screen.
- **Lighthouse**: Chrome DevTools → Lighthouse → PWA category, should score well now that the
  service worker is actually registered (previously it existed on disk but never ran).
