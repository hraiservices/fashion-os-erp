import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Next.js 16 renamed Middleware to Proxy (functionality is unchanged) — this file must be named
// `proxy.ts` at the same level as `app/`, not `middleware.ts`. See
// node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.
//
// `updateSession` was already fully built (session refresh + login/restricted-route redirects)
// but was never wired into an actual proxy/middleware entry point, so none of it was running.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// sw.js and manifest.json are excluded deliberately, not for tidiness: both are fetched by the
// browser itself rather than by the app, so they can arrive without the session cookie — and this
// proxy answers an unauthenticated request with a 307 to /login. A service worker script that
// redirects fails registration outright (the spec rejects any redirect on the script request),
// and a redirected manifest silently drops the PWA's install metadata. Neither contains anything
// private, so auth-gating them only ever broke them.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|api).*)"],
};
