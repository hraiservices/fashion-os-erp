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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|api).*)"],
};
