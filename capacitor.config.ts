import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Fashion Flow's Android/iOS shell — a thin native wrapper around the same deployed web app
 * (server.url below), not a separate offline bundle. This is the standard Capacitor pattern for
 * an app with real server-side rendering, auth and API routes (this one has all three): rather
 * than statically exporting the Next.js app into webDir and losing all of that, the native shell
 * just loads the live site, the same content everyone already gets by installing the PWA — the
 * only thing Capacitor adds on top is access to native device APIs (camera, push notifications,
 * etc.) through its plugins, wired up per-plugin as those get added.
 */
const config: CapacitorConfig = {
  appId: "app.fashionflow.mobile",
  appName: "Fashion Flow",
  // Required by the Capacitor CLI even in server.url mode — never actually loaded, see www/index.html.
  webDir: "www",
  server: {
    url: "https://app.fashionflow.app",
    // The production domain is already HTTPS — cleartext (plain HTTP) traffic stays disallowed.
    cleartext: false,
  },
};

export default config;
