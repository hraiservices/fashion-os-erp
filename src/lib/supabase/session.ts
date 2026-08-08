import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { isRestrictedRoute, isRestrictedRole, RESTRICTED_FALLBACK_ROUTE } from "@/lib/permissions";

const PUBLIC_PATHS = ["/login", "/invoice/view", "/api/public", "/api/recurring-invoices/generate"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Server-side enforcement of restricted routes (dashboard, reports, expenses, inventory,
  // purchases, etc.) — the client-side redirect in (app)/layout.tsx only hides the UI after
  // mount; a restricted role hitting these paths directly must be bounced here too.
  if (user?.email && isRestrictedRoute(request.nextUrl.pathname)) {
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("email", user.email).maybeSingle();
    if (isRestrictedRole(roleRow?.role || "tailor")) {
      const url = request.nextUrl.clone();
      url.pathname = RESTRICTED_FALLBACK_ROUTE;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
