import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";

/**
 * First-ever registered user becomes admin; everyone else defaults to "tailor".
 * Ported from handleSignInResult / mobile-signup flow (~lines 3478-3618). Uses
 * ignoreDuplicates so an admin-assigned role is NEVER overwritten on a later login.
 *
 * That first user is also the shop's self-serve signup — see the /signup page — so this is
 * also where the shop gets its very first `shop` app_settings row and a 14-day trial. Neither
 * write can ever run twice (both are gated on isFirstUser, which is permanently false after
 * this call), so there's no risk of resetting an existing shop's trial on a later login.
 */
export async function ensureUserRole(
  supabase: SupabaseClient<Database>,
  email: string,
  phone?: string,
  signupMeta?: { shopName?: string }
): Promise<void> {
  const cleanEmail = email.toLowerCase().trim();

  // user_roles_is_empty() is SECURITY DEFINER and answers the true table-wide question
  // regardless of RLS — this signing-in user has no row of their own yet (and isn't admin),
  // so a plain `.select('email').limit(1)` under user_roles_select_scoped's "own row OR
  // manageUsers" policy would always see zero rows and incorrectly call every signup "first".
  const { data: isFirstUser } = await supabase.rpc("user_roles_is_empty");
  const role = isFirstUser ? "admin" : "tailor";

  await supabase
    .from("user_roles")
    .upsert(
      { email: cleanEmail, role, ...(phone ? { phone } : {}) },
      { onConflict: "email", ignoreDuplicates: true }
    );

  if (!isFirstUser) return;

  try {
    const shopName = signupMeta?.shopName?.trim();
    if (shopName) {
      const { data: existingShop } = await supabase.from("app_settings").select("value").eq("key", "shop").maybeSingle();
      await supabase.from("app_settings").upsert({ key: "shop", value: { ...(existingShop?.value as object), name: shopName } });
    }
  } catch {
    // Best-effort — a failure here shouldn't block the owner's very first login. They can
    // still set the shop name manually in Settings afterwards.
  }

  // Give a brand-new self-serve deployment a 14-day trial with every module unlocked. Gated
  // on isFirstUser (never re-runs), and set_module_entitlements itself only accepts writes
  // from the platform-owner email (see add_module_entitlements.sql) — for every other
  // deployment this simply fails, which is fine: the app already defaults to
  // DEFAULT_ENTITLEMENTS (all modules on, no expiry) when no row exists at all, so a failed
  // trial-provisioning call here just leaves that same safe default in place.
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);
  try {
    await supabase.rpc("set_module_entitlements", {
      p_value: {
        ...DEFAULT_ENTITLEMENTS,
        billing: { ...DEFAULT_ENTITLEMENTS.billing, paidUntil: trialEnd.toISOString().slice(0, 10) },
      } as never,
    });
  } catch {
    // Not the platform-owner email, or offline — see comment above, this is a soft best-effort.
  }
}
