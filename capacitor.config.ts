import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Fashion Flow's Android/iOS shell — a thin native wrapper around a deployed web app
 * (server.url below), not a separate offline bundle. This is the standard Capacitor pattern for
 * an app with real server-side rendering, auth and API routes (this one has all three): rather
 * than statically exporting the Next.js app into webDir and losing all of that, the native shell
 * just loads a live site, the same content everyone already gets by installing the PWA — the
 * only thing Capacitor adds on top is access to native device APIs (camera, push notifications,
 * etc.) through its plugins, wired up per-plugin as those get added.
 *
 * This ONE binary (the one built for the Play Store) is shared by every customer's boutique —
 * each gets their own separate deployment/Supabase project (see scripts/onboard-customer.mjs),
 * so there's no single fixed dashboard URL to hardcode here anymore. server.url instead points at
 * /launch (see src/app/launch/page.tsx + src/lib/app-launch.ts), a lightweight gateway that asks
 * "which shop?" on first open, resolves that to the real URL, remembers it via
 * @capacitor/preferences, and redirects there — every later open skips straight through. A build
 * made for one specific customer's own private deployment (not the shared Play Store one) should
 * still point server.url directly at that customer's URL instead, skipping this gateway entirely.
 */
const config: CapacitorConfig = {
  appId: "app.fashionflow.mobile",
  appName: "Fashion Flow",
  // Required by the Capacitor CLI even in server.url mode — never actually loaded, see www/index.html.
  webDir: "www",
  server: {
    url: "https://swaroop.fashionflow.app/launch",
    // The production domain is already HTTPS — cleartext (plain HTTP) traffic stays disallowed.
    cleartext: false,
    // Bundled offline fallback with a retry button. Without it a failed load (dead zone, cold
    // start before connectivity settles) strands the app on the WebView's own error page, which
    // has no way back short of force-stopping it — the app just looks broken forever.
    errorPath: "error.html",
  },
};

export default config;
