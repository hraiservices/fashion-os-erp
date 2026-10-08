/**
 * Multi-tenant native-app launch flow (Play Store distribution).
 *
 * This app's Capacitor shell currently ships with capacitor.config.ts's server.url pointing
 * at ONE hardcoded deployment (swaroop.fashionflow.app) — fine for an app built for a single
 * boutique, but wrong the moment the same APK is handed out to OTHER boutiques on their own
 * separate deployments (each customer gets their own Supabase project + hosting, per
 * scripts/onboard-customer.mjs). One native binary can't bake in many different backend URLs.
 *
 * Fix, without standing up any new central service: point server.url at a lightweight gateway
 * page (src/app/launch/page.tsx) instead of straight at one shop's dashboard. On first open it
 * asks "which shop?", resolves that to a real URL, and remembers it — stored via
 * @capacitor/preferences (native, origin-independent) rather than localStorage, because the
 * WebView navigates CROSS-ORIGIN to the resolved shop's own domain right after, and
 * localStorage/IndexedDB are strictly per-origin so anything saved pre-redirect would be
 * unreadable there. Every future app open goes straight through on the saved value with no
 * prompt, and "Switch shop" (topbar account menu, native-only) clears it and sends them back
 * here.
 *
 * The gateway page itself has to live on ONE stable, always-reachable domain shared by every
 * installed copy of the app, regardless of which shop's backend that particular install ends up
 * pointed at. Hardcoded below to this deployment's own domain since there's no separate neutral
 * "fashionflow.app" marketing/hub site in this codebase (NEXT_PUBLIC_MARKETING_SITE_URL exists
 * as an env var, suggesting one exists elsewhere) — swap this constant if/when that's stood up.
 */
export const APP_GATEWAY_URL = "https://swaroop.fashionflow.app/launch";

export const SHOP_URL_PREFERENCE_KEY = "ff_shop_url";

/** The subdomain convention every onboarded shop's deployment follows today (see
 *  onboard-customer.mjs) — lets someone type just "swaroop" instead of the full URL. */
const SHOP_DOMAIN_SUFFIX = ".fashionflow.app";

/**
 * Turns whatever someone typed into the "shop code / web address" field into a real https URL.
 * Accepts a bare code ("swaroop" -> https://swaroop.fashionflow.app), a bare custom domain
 * ("myboutique.com" -> https://myboutique.com), or an already-complete URL (used as-is, trailing
 * slash trimmed). Returns null for empty/whitespace-only input — the caller shows a validation
 * error rather than attempting a bogus navigation.
 */
export function resolveShopUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  // A bare word with no dot at all is assumed to be a shop code under this product's own
  // subdomain convention; anything containing a dot (a custom domain, or already
  // "shop.fashionflow.app") is trusted as a full host on its own.
  const host = trimmed.includes(".") ? trimmed : `${trimmed}${SHOP_DOMAIN_SUFFIX}`;
  return `https://${host.replace(/\/+$/, "")}`;
}
