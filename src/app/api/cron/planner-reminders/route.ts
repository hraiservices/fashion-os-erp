import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_ENTITLEMENTS, isModuleEnabled, type ModuleEntitlements } from "@/lib/entitlements";
import { istDateString } from "@/lib/ist-date";
import { isPlannerReminderDue } from "@/lib/planner";
import { sendPushToEmails } from "@/lib/push";
import { fetchAll, inBatches } from "@/lib/targets-server";

/**
 * Daily cron (vercel.json, shortly after task-reminders) — pushes each planner entry whose
 * reminder falls on today's IST date, same once-a-day cadence as every other reminder in this
 * app (not minute-of-day precision: a 3pm reminder goes out with the morning batch, not at 3pm).
 * `reminder_sent_for` records the IST date it was sent for, same dedupe pattern as
 * work_tasks.reminder_sent_for — changing an entry's reminder time clears it, re-arming the push.
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
    // Reminders can only ever be "due" within today's IST calendar day, so a plain UTC-ish window
    // around now comfortably covers it without scanning the whole table.
    const candidates = await fetchAll((a, b) =>
      db
        .from("planner_entries")
        .select("id, owner_id, text, entry_date, reminder_at, reminder_sent_for")
        .not("reminder_at", "is", null)
        .gte("reminder_at", `${today}T00:00:00+05:30`)
        .lt("reminder_at", `${today}T23:59:59.999+05:30`)
        .order("id")
        .range(a, b)
    );
    const due = candidates.filter((e) => isPlannerReminderDue({ reminderAt: e.reminder_at, reminderSentFor: e.reminder_sent_for }, today));
    if (due.length === 0) return NextResponse.json({ sent: 0, entries: 0 });

    const ownerIds = Array.from(new Set(due.map((e) => e.owner_id)));
    const roles = ownerIds.length ? await inBatches(ownerIds, (ids) => db.from("user_roles").select("email, linked_employee_id").in("linked_employee_id", ids)) : [];
    const emailsFor = (ownerId: string): string[] => roles.filter((r) => r.linked_employee_id === ownerId).map((r) => r.email);

    const byPerson = new Map<string, (typeof due)[number][]>();
    for (const e of due) for (const email of emailsFor(e.owner_id)) byPerson.set(email.toLowerCase(), [...(byPerson.get(email.toLowerCase()) || []), e]);

    const reached = new Set<string>();
    for (const [email, entries] of byPerson) {
      const first = entries[0];
      const payload =
        entries.length === 1
          ? { critical: true, title: "Planner reminder", body: first.text, url: "/targets?tab=planner" }
          : { critical: true, title: `${entries.length} planner reminders`, body: entries.slice(0, 3).map((e) => e.text).join(", ") + (entries.length > 3 ? "…" : ""), url: "/targets?tab=planner" };
      const devices = await sendPushToEmails([email], payload).catch(() => 0);
      if (devices > 0) for (const e of entries) reached.add(e.id);
    }

    for (let i = 0; i < due.length; i += 100) {
      const ids = due.slice(i, i + 100).filter((e) => reached.has(e.id)).map((e) => e.id);
      if (ids.length) await db.from("planner_entries").update({ reminder_sent_for: today }).in("id", ids);
    }

    return NextResponse.json({ sent: reached.size, entries: due.length, people: byPerson.size });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Planner reminders failed" }, { status: 500 });
  }
}
