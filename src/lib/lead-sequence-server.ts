import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { istDateString } from "@/lib/ist-date";
import { cleanSequences, LEAD_SEQUENCES_KEY, SEQUENCE_TAG_PREFIX, sequenceTasks, type LeadSequence } from "@/lib/lead-sequences";

/**
 * Starting and stopping a lead's follow-up plan. Each step becomes an ordinary task for the lead's
 * owner — the agreed rule is that staff send, so nothing here messages a customer. Takes the
 * service-role client (`db`), same as the rest of targets-server.
 */

export async function loadSequences(db: SupabaseClient<Database>): Promise<LeadSequence[]> {
  const { data } = await db.from("app_settings").select("value").eq("key", LEAD_SEQUENCES_KEY).maybeSingle();
  return cleanSequences(data?.value);
}

/** Creates the plan's tasks for one lead. Returns how many were made; 0 when the plan is unknown. */
export async function startSequence(
  db: SupabaseClient<Database>,
  lead: { id: string; name: string; assigned_employee_id: string | null },
  seq: LeadSequence,
  email: string,
  startDate: string = istDateString()
): Promise<number> {
  const rows = sequenceTasks(seq, lead.name, startDate).map((t) => ({
    title: t.title,
    description: "",
    assignee_id: lead.assigned_employee_id,
    priority: "medium",
    status: "todo",
    due_date: t.dueDate,
    link_type: "lead",
    link_id: lead.id,
    tags: [t.tag],
    reminder: "on_due",
    created_by: email,
  }));
  if (!rows.length) return 0;
  const { error } = await db.from("work_tasks").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Calls off whatever is left of a lead's plan — used when it is won or lost, or when staff stop it by hand. */
export async function cancelSequenceTasks(db: SupabaseClient<Database>, leadId: string): Promise<number> {
  const { data } = await db.from("work_tasks").select("id, tags").eq("link_type", "lead").eq("link_id", leadId).not("status", "in", "(done,cancelled)");
  const ids = (data || []).filter((t) => (t.tags ?? []).some((tag) => tag.startsWith(SEQUENCE_TAG_PREFIX))).map((t) => t.id);
  if (!ids.length) return 0;
  await db.from("work_tasks").update({ status: "cancelled", updated_at: new Date().toISOString() }).in("id", ids);
  return ids.length;
}

/** Which plan (if any) this lead is already on — so the page can offer Stop instead of Start. */
export async function activeSequenceOf(db: SupabaseClient<Database>, leadId: string): Promise<string | null> {
  const { data } = await db.from("work_tasks").select("tags").eq("link_type", "lead").eq("link_id", leadId).not("status", "in", "(done,cancelled)").limit(50);
  for (const t of data || []) {
    const tag = (t.tags ?? []).find((x) => x.startsWith(SEQUENCE_TAG_PREFIX));
    if (tag) return tag.slice(SEQUENCE_TAG_PREFIX.length);
  }
  return null;
}
