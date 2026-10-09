import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { isRestrictedRoute, isRestrictedRole, RESTRICTED_FALLBACK_ROUTE } from "@/lib/permissions";
import { REPORTS_GROUP, resolveReportSection, SETTINGS_GROUP, EMPLOYEES_GROUP, ORDERS_GROUP } from "@/components/app-shell/nav-config";
import { DEFAULT_ENTITLEMENTS, ROUTE_MODULE_PREFIXES, isModuleEnabled, isReportEnabled, isSettingEnabled, type ModuleEntitlements } from "@/lib/entitlements";
import { getCachedAppSetting } from "@/lib/supabase/app-settings-cache";

// /checkin is the self-service PIN portal (src/app/checkin/page.tsx) — it has its own
// attendance-session cookie (lib/attendance-auth.ts), entirely separate from Supabase Auth,
// specifically for shop-floor staff who don't have an email/password account. Without this
// entry, every unauthenticated visit to /checkin was server-redirected to /login before the
// page could even render its own PIN login form — silently making self-service check-in (and
// the leave-management self-service tab) completely unreachable.
// /launch is the native app's actual entry point (src/app/launch/page.tsx, capacitor.config.ts's
// server.url) — it has to run for a logged-out install same as /login/checkin, since its whole
// job is picking which shop's login page to send a brand-new install to. Missing from this list,
// it got the same treatment as any other unauthenticated protected-route hit: redirected straight
// to /login before the page's own code ever ran, silently skipping the shop picker entirely.
const PUBLIC_PATHS = ["/login", "/signup", "/launch", "/checkin", "/invoice/view", "/track", "/api/public", "/api/recurring-invoices/generate"];

// Of the public paths, only /login and /signup actually do anything with the auth result (bounce
// an already-logged-in visitor to /dashboard instead of showing them the form again) — every
// other public path (/launch, /checkin's own PIN auth, /invoice/view, /track, /api/public, the
// recurring-invoices cron) never looks at `user` at all. supabase.auth.getUser() is a real network
// round-trip to Supabase's Auth API, not a local cookie decode, so paying it on every one of those
// is pure dead latency — concretely, on every single cold app open: the native shell's entry point
// IS /launch (capacitor.config.ts's server.url), so this round-trip ran on every app start whether
// or not anything downstream cared about the answer.
const AUTH_AWARE_PUBLIC_PATHS = ["/login", "/signup"];

function isSuperAdminEmail(email: string | undefined): boolean {
  const ownerEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;
  return !!ownerEmail && !!email && email.toLowerCase() === ownerEmail.toLowerCase();
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const needsAuthCheck = !isPublicPath || AUTH_AWARE_PUBLIC_PATHS.some((p) => pathname === p);

  let supabaseResponse = NextResponse.next({ request });

  // Nothing past this point reads `user` for a path in this bucket (see AUTH_AWARE_PUBLIC_PATHS'
  // comment) — skip creating a Supabase client and the auth round-trip entirely instead of paying
  // for an answer nothing downstream uses.
  if (!needsAuthCheck) {
    return supabaseResponse;
  }

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

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
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

  // Server-side enforcement of module licensing (see src/lib/entitlements.ts). Only queries
  // app_settings when the path actually matches a gated module prefix or a known report leaf —
  // every other route (login, orders, crm, settings, ...) pays zero extra cost.
  if (user && !isSuperAdminEmail(user.email)) {
    const pathname = request.nextUrl.pathname;
    const modulePrefix = Object.keys(ROUTE_MODULE_PREFIXES).find((p) => pathname === p || pathname.startsWith(`${p}/`));
    const reportLeaf = REPORTS_GROUP.children.find((c) => c.href.split("?")[0] === pathname);
    // Several /settings/* leaves render under other sidebar groups now (attendance-payroll,
    // leave-policy, tailor-rates, users under Employees; rates, measurements under Stitching
    // Orders) — still gate-able via module licensing the same as any other settings page, so
    // every group that can hold a settings leaf is checked here.
    const settingsLeaf =
      SETTINGS_GROUP.children.find((c) => c.href === pathname) ||
      EMPLOYEES_GROUP.children.find((c) => c.href === pathname) ||
      ORDERS_GROUP.children.find((c) => c.href === pathname);

    if (modulePrefix || reportLeaf || settingsLeaf) {
      // Short-TTL cached (app-settings-cache.ts) — this ran on every gated navigation with zero
      // caching, confirmed by a live performance audit as a meaningful share of total request
      // volume. Module licensing is already soft/fail-open by design, so a few seconds of
      // staleness after an admin changes it is an accepted, deliberate tradeoff.
      const settingValue = await getCachedAppSetting(supabase, "moduleEntitlements");
      // Shallow-merge over the defaults, same as the client-side useAppSetting hook does for
      // every other setting — a row saved before a newer top-level key existed (e.g. `settings`,
      // added after `modules`/`reports`/`widgets`/`billing`/`limits` were already in use) would
      // otherwise come back missing that key entirely, and isSettingEnabled()/isModuleEnabled()
      // reading `entitlements.settings[href]` on a genuinely undefined `settings` throws — in
      // middleware, uncaught by any error boundary, so it took down the whole route with a raw
      // 500 rather than a clean fallback.
      const entitlements: ModuleEntitlements = { ...DEFAULT_ENTITLEMENTS, ...(settingValue as Partial<ModuleEntitlements> | null) };

      // A path can be both a module page and a REPORTS_GROUP leaf (e.g. /purchases/bills) —
      // the module check takes priority since these are primarily functional module pages,
      // only secondarily linked from the Reports center.
      const moduleDisabled = modulePrefix ? !isModuleEnabled(entitlements, ROUTE_MODULE_PREFIXES[modulePrefix]) : false;
      const reportDisabled = !modulePrefix && reportLeaf ? !isReportEnabled(entitlements, reportLeaf.href, resolveReportSection(reportLeaf.href)) : false;
      const settingsDisabled = !modulePrefix && !reportLeaf && settingsLeaf ? !isSettingEnabled(entitlements, settingsLeaf.href) : false;

      if (moduleDisabled || reportDisabled || settingsDisabled) {
        const url = request.nextUrl.clone();
        url.pathname = reportDisabled ? "/reports" : settingsDisabled ? "/settings/personalize" : RESTRICTED_FALLBACK_ROUTE;
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
