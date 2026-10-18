import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { catchUpDueDate } from "@/lib/task-repeat";

type TaskRow = Database["public"]["Tables"]["work_tasks"]["Row"];

/**
 * Creating the next occurrence of a repeating task. The repeat rule always travels with the
 * LATEST task in a chain — whoever spawns the next one clears it from the old — so a routine
 * can never fork into two chains, however many times a cron or a tick-off runs.
 */
export async function spawnNextOccurrence(db: SupabaseClient<Database>, from: TaskRow, dueDate: string, rule: string, mode: string): Promise<string | null> {
  const { data, error } = await db
    .from("work_tasks")
    .insert({
      title: from.title,
      description: from.description || "",
      project_id: from.project_id,
      group_name: from.group_name || "",
      assignee_id: from.assignee_id,
      priority: from.priority,
      status: "todo",
      due_date: dueDate,
      // A fresh copy of the checklist, with everything unticked again.
      checklist: Array.isArray(from.checklist) ? (from.checklist as { text: string; done: boolean }[]).map((i) => ({ text: String(i?.text ?? ""), done: false })) : [],
      link_type: from.link_type,
      link_id: from.link_id,
      tags: from.tags ?? [],
      reminder: from.reminder ?? "none",
      repeat_rule: rule,
      repeat_mode: mode,
      created_by: from.created_by,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/**
 * Daily sweep for routines on a fixed schedule: every repeating task whose due date has passed
 * gets its replacement, and hands over the rule. A shop that was closed for a fortnight gets one
 * task waiting, not fourteen (see catchUpDueDate).
 */
export async function runScheduledRepeats(db: SupabaseClient<Database>, today: string): Promise<{ created: number }> {
  const { data, error } = await db.from("work_tasks").select("*").eq("repeat_mode", "schedule").neq("repeat_rule", "").lt("due_date", today).limit(500);
  if (error) throw new Error(error.message);
  let created = 0;
  for (const row of data || []) {
    const next = catchUpDueDate(row.repeat_rule ?? "", row.due_date || today, today);
    if (!next) continue;
    // Clear the old one first: if the insert then fails, the routine stops rather than doubling up.
    const { error: clearError } = await db.from("work_tasks").update({ repeat_rule: "", repeat_mode: "" }).eq("id", row.id).neq("repeat_rule", "");
    if (clearError) continue;
    try {
      await spawnNextOccurrence(db, row, next, row.repeat_rule ?? "", "schedule");
      created += 1;
    } catch (e) {
      console.error(`Repeat for task ${row.id} couldn't be created:`, e);
    }
  }
  return { created };
}
