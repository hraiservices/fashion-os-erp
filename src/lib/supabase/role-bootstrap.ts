import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * First-ever registered user becomes admin; everyone else defaults to "tailor".
 * Ported from handleSignInResult / mobile-signup flow (~lines 3478-3618). Uses
 * ignoreDuplicates so an admin-assigned role is NEVER overwritten on a later login.
 */
export async function ensureUserRole(
  supabase: SupabaseClient<Database>,
  email: string,
  phone?: string
): Promise<void> {
  const cleanEmail = email.toLowerCase().trim();

  const { data: rows } = await supabase.from("user_roles").select("email").limit(1);
  const isFirstUser = !rows || rows.length === 0;
  const role = isFirstUser ? "admin" : "tailor";

  await supabase
    .from("user_roles")
    .upsert(
      { email: cleanEmail, role, ...(phone ? { phone } : {}) },
      { onConflict: "email", ignoreDuplicates: true }
    );
}
