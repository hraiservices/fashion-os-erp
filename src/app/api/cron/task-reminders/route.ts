import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_ENTITLEMENTS, isModuleEnabled, type ModuleEntitlements } from "@/lib/entitlements";
import { istDateString } from "@/lib/ist-date";
import { sendPushToEmails } from "@/lib/push";
import { fetchAll, inBatches } from "@/lib/targets-server";
import { addDaysIso, dueInWords, isReminderDue } from "@/lib/work-tasks";

/**
 * Morning cron (vercel.json, ~9 am IST): sends each task's "Reminder" — the choice on the task form (on the due
 * date, 1 or 2 days before, a week before) — as a push notification to the person the task is for. A task
 * with no owner goes to whoever created it.
 *
 * Same CRON_SECRET auth as the other crons. Safe to run twice: a task's `reminder_sent_for` records the due date
 * it was sent for, so it isn't repeated (and moving the due date re-arms it). A task is only marked sent once at
 * least one device was reached — someone with notifications off everywhere is tried again the next morning, while
 * the task is still due.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 501 });
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 501 });

  const { data: entSetting } = await db.from("app_settings").select("value").eq("key", "moduleEntitlements").maybeSingle();
  const entitlements: ModuleEntitlements = { ...DEFAULT_ENTITLEMENTS, ...(entSetting?.value as Partial<ModuleEntitlements> | null) };
  if (!isModuleEnabled(entitlements, "targets")) return NextResponse.json({ skipped: true, reason: "Targets module is off" });

  const today = istDateString();
  try {
    // Open tasks with a reminder whose due date is today or within the longest lead time (a week).
    const candidates = await fetchAll((a, b) =>
      db
        .from("work_tasks")
        .select("id, title, due_date, reminder, status, reminder_sent_for, assignee_id, created_by, link_type, link_id")
        .neq("reminder", "none")
        .not("status", "in", "(done,cancelled)")
        .gte("due_date", today)
        .lte("due_date", addDaysIso(today, 7))
        .order("id")
        .range(a, b)
    );
    const due = candidates.filter((t) => isReminderDue({ dueDate: t.due_date, reminder: t.reminder, status: t.status, reminderSentFor: t.reminder_sent_for }, today));
    if (due.length === 0) return NextResponse.json({ sent: 0, tasks: 0 });

    // Who each task is for: the owner's login emails, else the creator's.
    const employeeIds = Array.from(new Set(due.map((t) => t.assignee_id).filter((x): x is string => !!x)));
    const roles = employeeIds.length ? await inBatches(employeeIds, (ids) => db.from("user_roles").select("email, linked_employee_id").in("linked_employee_id", ids)) : [];
    const emailsFor = (t: (typeof due)[number]): string[] => {
      if (t.assignee_id) {
        const owners = roles.filter((r) => r.linked_employee_id === t.assignee_id).map((r) => r.email);
        if (owners.length) return owners;
      }
      return t.created_by ? [t.created_by] : [];
    };

    // One notification per person: the task itself if there is one, a short summary if there are several.
    const byPerson = new Map<string, (typeof due)[number][]>();
    for (const t of due) for (const email of emailsFor(t)) byPerson.set(email.toLowerCase(), [...(byPerson.get(email.toLowerCase()) || []), t]);

    const reached = new Set<string>();
    for (const [email, tasks] of byPerson) {
      const first = tasks[0];
      const payload =
        tasks.length === 1
          ? { title: "Task reminder", body: `${first.title} — ${dueInWords(first.due_date as string, today)}`, url: first.link_type === "lead" && first.link_id ? `/targets/leads/${first.link_id}` : "/targets" }
          : { title: `${tasks.length} task reminders`, body: `${tasks.slice(0, 3).map((t) => t.title).join(", ")}${tasks.length > 3 ? "…" : ""}`, url: "/targets" };
      const devices = await sendPushToEmails([email], payload).catch(() => 0);
      if (devices > 0) for (const t of tasks) reached.add(t.id);
    }

    // Mark what went out, a few dates at a time (the due date is what a reminder is "for").
    const sentFor = new Map<string, string[]>();
    for (const t of due) if (reached.has(t.id)) sentFor.set(t.due_date as string, [...(sentFor.get(t.due_date as string) || []), t.id]);
    for (const [dueDate, ids] of sentFor) {
      for (let i = 0; i < ids.length; i += 100) await db.from("work_tasks").update({ reminder_sent_for: dueDate }).in("id", ids.slice(i, i + 100));
    }

    return NextResponse.json({ sent: reached.size, tasks: due.length, people: byPerson.size });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Reminders failed" }, { status: 500 });
  }
}
