import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { serverError } from "@/lib/targets-api";
import { buildShareContacts } from "@/lib/targets-share";
import { targetsContext } from "@/lib/targets-server";

/**
 * The team members a Targets item can be shared with: name and role, the mobile number for WhatsApp, and — only for
 * people who may see everyone's work (admins, managers) — the login email of each person who has one, for email.
 *
 * Read when the Share panel opens rather than with the rest of the Targets pickers, so contact details aren't sent to
 * every screen. Mobile numbers are in the employee directory every signed-in member can already read; login emails
 * are not (user_roles is locked down per row), which is why they are held back from everyone else.
 */
export async function GET() {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  const db: SupabaseClient<Database> = ctx.db;

  const [staff, logins] = await Promise.all([
    db.from("employees").select("id, name, role, mobile, active").eq("active", true).order("name"),
    ctx.seesAll ? db.from("user_roles").select("email, linked_employee_id").not("linked_employee_id", "is", null) : null,
  ]);
  if (staff.error) return serverError(staff.error.message);

  return NextResponse.json({
    emailsIncluded: ctx.seesAll,
    contacts: buildShareContacts(staff.data || [], logins?.data || [], { viewerEmployeeId: ctx.employeeId, includeEmails: ctx.seesAll }),
  });
}
