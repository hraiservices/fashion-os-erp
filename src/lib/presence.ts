import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-only helper for the "who's logged in, who's LIVE" feature (Settings > Users & Access +
 * the dashboard card) — see add_login_presence_tracking.sql. Called from the three places a
 * sign-in actually happens (portal email/password, portal phone+PIN, /checkin PIN) and from the
 * heartbeat route. Never imported into client code — always goes through a service-role client.
 */

export type LoginType = "portal" | "checkin";
export type LoginMethod = "email" | "phone" | "pin";

export interface Identity {
  loginType: LoginType;
  method: LoginMethod;
  email?: string | null;
  employeeId?: string | null;
  displayName: string;
  role?: string | null;
}

/** A portal login's own email is often not human-readable — a phone-provisioned account has a
 *  synthetic `emp-<uuid>@dashboard.local` address (see use-user-roles.ts's own comment on the
 *  pattern) that means nothing to an admin reading the live list. Prefer the linked employee's
 *  real name whenever one exists; only fall back to the raw email for a standalone login with
 *  no employee link at all. */
export async function resolvePortalDisplayName(serviceClient: SupabaseClient<Database>, email: string, employeeId?: string | null): Promise<string> {
  if (employeeId) {
    const { data: employee } = await serviceClient.from("employees").select("name").eq("id", employeeId).maybeSingle();
    if (employee?.name) return employee.name;
  }
  return email;
}

/** portal logins are keyed by email (an employee-linked portal login is still ONE subject, not
 *  two, even though the same person also gets a `checkin`-typed presence row from /checkin
 *  itself if they use that separately) — checkin-only logins are keyed by employee id. */
function subjectKey(identity: Pick<Identity, "loginType" | "email" | "employeeId">): string {
  if (identity.loginType === "portal") return `portal:${(identity.email || "").toLowerCase()}`;
  return `checkin:${identity.employeeId}`;
}

/** Records a login_events history row AND starts this subject's presence immediately (no need
 *  to wait for the first heartbeat tick to show someone who just signed in as live). */
export async function recordLogin(serviceClient: SupabaseClient<Database>, identity: Identity): Promise<void> {
  const key = subjectKey(identity);
  await Promise.all([
    serviceClient.from("login_events").insert({
      login_type: identity.loginType,
      method: identity.method,
      email: identity.email || null,
      employee_id: identity.employeeId || null,
      display_name: identity.displayName,
      role: identity.role || null,
    }),
    serviceClient.from("user_presence").upsert(
      {
        subject_key: key,
        login_type: identity.loginType,
        method: identity.method,
        email: identity.email || null,
        employee_id: identity.employeeId || null,
        display_name: identity.displayName,
        role: identity.role || null,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "subject_key" }
    ),
  ]);
}

/** Heartbeat tick — bumps last_seen (plus refreshes display_name/role in case either changed
 *  since the last login, e.g. a role change). A plain UPDATE first, so a heartbeat — which
 *  doesn't reliably know the ORIGINAL sign-in method (phone vs email) — never clobbers that
 *  column; only falls back to a full upsert (with method as given) for the rare case where the
 *  presence row is missing entirely, e.g. cleared by an admin or the very first tick racing
 *  ahead of recordLogin(). */
export async function touchPresence(serviceClient: SupabaseClient<Database>, identity: Identity): Promise<void> {
  const key = subjectKey(identity);
  const { data } = await serviceClient
    .from("user_presence")
    .update({ display_name: identity.displayName, role: identity.role || null, last_seen: new Date().toISOString() })
    .eq("subject_key", key)
    .select("subject_key");
  if (data && data.length > 0) return;

  await serviceClient.from("user_presence").upsert(
    {
      subject_key: key,
      login_type: identity.loginType,
      method: identity.method,
      email: identity.email || null,
      employee_id: identity.employeeId || null,
      display_name: identity.displayName,
      role: identity.role || null,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "subject_key" }
  );
}

/** LIVE = a heartbeat (or the login itself) seen within this window. 30s heartbeat interval +
 *  generous margin for a slow/backgrounded tab's next tick to still land before it flips to
 *  offline. */
export const LIVE_WINDOW_MS = 2 * 60_000;
