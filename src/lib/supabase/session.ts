import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { isRestrictedRoute, isRestrictedRole, RESTRICTED_FALLBACK_ROUTE } from "@/lib/permissions";
import { REPORTS_GROUP, resolveReportSection, SETTINGS_GROUP } from "@/components/app-shell/nav-config";
import { DEFAULT_ENTITLEMENTS, ROUTE_MODULE_PREFIXES, isModuleEnabled, isReportEnabled, isSettingEnabled, type ModuleEntitlements } from "@/lib/entitlements";

// /checkin is the self-service PIN portal (src/app/checkin/page.tsx) — it has its own
// attendance-session cookie (lib/attendance-auth.ts), entirely separate from Supabase Auth,
// specifically for shop-floor staff who don't have an email/password account. Without this
// entry, every unauthenticated visit to /checkin was server-redirected to /login before the
// page could even render its own PIN login form — silently making self-service check-in (and
// the leave-management self-service tab) completely unreachable.
const PUBLIC_PATHS = ["/login", "/checkin", "/invoice/view", "/api/public", "/api/recurring-invoices/generate"];

function isSuperAdminEmail(email: string | undefined): boolean {
  const ownerEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;
  return !!ownerEmail && !!email && email.toLowerCase() === ownerEmail.toLowerCase();
}

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

  // Server-side enforcement of module licensing (see src/lib/entitlements.ts). Only queries
  // app_settings when the path actually matches a gated module prefix or a known report leaf —
  // every other route (login, orders, crm, settings, ...) pays zero extra cost.
  if (user && !isSuperAdminEmail(user.email)) {
    const pathname = request.nextUrl.pathname;
    const modulePrefix = Object.keys(ROUTE_MODULE_PREFIXES).find((p) => pathname === p || pathname.startsWith(`${p}/`));
    const reportLeaf = REPORTS_GROUP.children.find((c) => c.href.split("?")[0] === pathname);
    const settingsLeaf = SETTINGS_GROUP.children.find((c) => c.href === pathname);

    if (modulePrefix || reportLeaf || settingsLeaf) {
      const { data: settingRow } = await supabase.from("app_settings").select("value").eq("key", "moduleEntitlements").maybeSingle();
      const entitlements = (settingRow?.value as ModuleEntitlements | null) || DEFAULT_ENTITLEMENTS;

      // A path can be both a module page and a REPORTS_GROUP leaf (e.g. /purchases/bills) —
      // the module check takes priority since these are primarily functional module pages,
      // only secondarily linked from the Reports center.
      const moduleDisabled = modulePrefix ? !isModuleEnabled(entitlements, ROUTE_MODULE_PREFIXES[modulePrefix]) : false;
      const reportDisabled = !modulePrefix && reportLeaf ? !isReportEnabled(entitlements, reportLeaf.href, resolveReportSection(reportLeaf.href)) : false;
      const settingsDisabled = !modulePrefix && !reportLeaf && settingsLeaf ? !isSettingEnabled(entitlements, settingsLeaf.href) : false;

      if (moduleDisabled || reportDisabled || settingsDisabled) {
        const url = request.nextUrl.clone();
        url.pathname = reportDisabled ? "/reports" : settingsDisabled ? "/settings/account" : RESTRICTED_FALLBACK_ROUTE;
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
