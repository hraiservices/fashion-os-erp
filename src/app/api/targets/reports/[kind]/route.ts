import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { istDateString } from "@/lib/ist-date";
import { OPEN_STAGES } from "@/lib/lead-stages";
import { buildLeaderboard, incentiveFor, lostReasonStats, monthRange, pipelineSummary, sourceStats, winRate } from "@/lib/targets";
import { buildTaskLoad, overdueAgeBuckets, rangesOverlap } from "@/lib/targets-reports";
import { dateStr, forbidden, notFound, serverError } from "@/lib/targets-api";
import { fetchAll, fetchLeadFactRows, fetchLeadRows, fetchSaleFacts, leadFactOf, loadStaff, loadTargetsWithProgress, targetsContext } from "@/lib/targets-server";
import { mapProjectRow, type LeaderboardReportRow, type LostReport, type PipelineReport, type ProjectsReport, type SourcesReport, type TargetReportRow, type TasksReport } from "@/lib/targets-types";
import { isOverdue, projectProgress } from "@/lib/work-tasks";

const KINDS = ["target-vs-achievement", "leaderboard", "pipeline", "sources", "lost", "tasks", "projects"] as const;
type Kind = (typeof KINDS)[number];

const dayOf = (ts: string | null) => (ts ? istDateString(new Date(ts)) : null);

/**
 * GET /api/targets/reports/<kind>?from=YYYY-MM-DD&to=YYYY-MM-DD — data for the seven Targets
 * reports. These show everyone's numbers, so they need "see everyone's work" plus the normal
 * Reports permission; per-role report switches in Settings → Users hide them from the menu on top.
 */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(KINDS as readonly string[]).includes(kind)) return notFound("Unknown report");

  const gate = await targetsContext("viewAllTargets");
  if ("error" in gate) return gate.error;
  const { ctx } = gate;
  if (!ctx.perms.viewReports) return forbidden("You don't have permission to view reports");
  const db: SupabaseClient<Database> = ctx.db;

  const today = istDateString();
  const sp = new URL(request.url).searchParams;
  const month = monthRange(today);
  const from = dateStr.safeParse(sp.get("from")).success ? (sp.get("from") as string) : month.start;
  const to = dateStr.safeParse(sp.get("to")).success ? (sp.get("to") as string) : month.end;
  if (to < from) return NextResponse.json({ error: "The end date can't be before the start date" }, { status: 400 });

  try {
    const staff = await loadStaff(db);
    const nameOf = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? "Unknown" : "Not assigned");

    switch (kind as Kind) {
      case "target-vs-achievement": {
        const all = await loadTargetsWithProgress(ctx, today);
        const rows: TargetReportRow[] = all
          .filter((t) => rangesOverlap({ start: t.startDate, end: t.endDate }, { start: from, end: to }))
          .map((t) => ({ ...t, assigneeNames: t.scope === "shop" ? ["Whole shop"] : t.assigneeIds.map(nameOf) }));
        return NextResponse.json({ from, to, rows });
      }

      case "leaderboard": {
        const [sales, leadRows, targets, empRes] = await Promise.all([
          fetchSaleFacts(db, from, to, { lines: false }), // the scoreboard only needs each sale's total and who it is credited to
          fetchLeadFactRows(db),
          loadTargetsWithProgress(ctx, today),
          db.from("employees").select("id, commission_type, commission_rate"),
        ]);
        const commission = new Map((empRes.data || []).map((e) => [e.id, e]));
        const hit = targets.filter((t) => t.progress.status === "achieved" && rangesOverlap({ start: t.startDate, end: t.endDate }, { start: from, end: to }));
        const rows: LeaderboardReportRow[] = buildLeaderboard(sales, leadRows.map(leadFactOf), { start: from, end: to }).map((r) => {
          const c = r.personId ? commission.get(r.personId) : null;
          return {
            ...r,
            name: r.personId ? nameOf(r.personId) : "Not credited to anyone",
            targetsHit: r.personId ? hit.filter((t) => t.assigneeIds.includes(r.personId as string)).length : 0,
            incentive: c ? Math.round(incentiveFor(c.commission_type, Number(c.commission_rate) || 0, { value: r.value, sales: r.sales })) : 0,
          };
        });
        return NextResponse.json({ from, to, rows });
      }

      case "pipeline": {
        const leads = (await fetchLeadRows(db)).filter((r) => (OPEN_STAGES as readonly string[]).includes(r.stage));
        const facts = leads.map(leadFactOf);
        const summary = pipelineSummary(facts, OPEN_STAGES);
        const owners = new Map<string | null, { ownerId: string | null; name: string; count: number; value: number; likelyValue: number }>();
        for (const l of leads) {
          const o = owners.get(l.assigned_employee_id) || { ownerId: l.assigned_employee_id, name: nameOf(l.assigned_employee_id), count: 0, value: 0, likelyValue: 0 };
          o.count += 1;
          o.value += Number(l.expected_value) || 0;
          if (l.likely_to_close) o.likelyValue += Number(l.expected_value) || 0;
          owners.set(l.assigned_employee_id, o);
        }
        const payload: PipelineReport = {
          ...summary,
          byOwner: Array.from(owners.values()).sort((a, b) => b.value - a.value),
          likelyLeads: leads
            .filter((l) => l.likely_to_close)
            .sort((a, b) => (Number(b.expected_value) || 0) - (Number(a.expected_value) || 0))
            .slice(0, 30)
            .map((l) => ({ id: l.id, name: l.name, value: Number(l.expected_value) || 0, stage: l.stage, owner: nameOf(l.assigned_employee_id) })),
        };
        return NextResponse.json({ from, to, ...payload });
      }

      case "sources": {
        const leads = (await fetchLeadFactRows(db)).map(leadFactOf).filter((l) => (l.createdDate || "") >= from && (l.createdDate || "") <= to);
        const payload: SourcesReport = { rows: sourceStats(leads), winRate: winRate(leads), totalLeads: leads.length };
        return NextResponse.json({ from, to, ...payload });
      }

      case "lost": {
        const rows = (await fetchLeadRows(db)).filter((l) => l.stage === "lost" && (dayOf(l.lost_at) || "") >= from && (dayOf(l.lost_at) || "") <= to);
        const payload: LostReport = {
          reasons: lostReasonStats(rows.map(leadFactOf)),
          leads: rows.map((l) => ({ id: l.id, name: l.name, reason: l.lost_reason || "Not recorded", value: Number(l.expected_value) || 0, owner: nameOf(l.assigned_employee_id), lostOn: dayOf(l.lost_at) })),
        };
        return NextResponse.json({ from, to, ...payload });
      }

      case "tasks": {
        // Every task, in pages (a single query stops at 1000 rows and would drop the rest from the counts).
        const tasks = await fetchAll((a, b) => db.from("work_tasks").select("assignee_id, status, due_date, completed_at").order("id").range(a, b));
        const forReport = tasks.map((t) => ({ assigneeId: t.assignee_id, status: t.status, dueDate: t.due_date, completedDate: dayOf(t.completed_at) }));
        const payload: TasksReport = {
          rows: buildTaskLoad(forReport, today, { from, to }).map((r) => ({ ...r, name: nameOf(r.assigneeId) })),
          ageBuckets: overdueAgeBuckets(forReport, today),
        };
        return NextResponse.json({ from, to, ...payload });
      }

      case "projects": {
        const [{ data: projects }, tasks] = await Promise.all([
          db.from("work_projects").select("*").order("created_at", { ascending: false }),
          fetchAll((a, b) => db.from("work_tasks").select("id, project_id, status, due_date").not("project_id", "is", null).order("id").range(a, b)),
        ]);
        // Projects running in the period; one with no dates at all is always listed (there is nothing to compare).
        const running = (projects || []).filter((p) => rangesOverlap({ start: p.start_date ?? "0000-01-01", end: p.end_date ?? "9999-12-31" }, { start: from, end: to }));
        const payload: ProjectsReport = {
          projects: running.map((p) => {
            const pt = tasks.filter((t) => t.project_id === p.id);
            return {
              ...mapProjectRow(p),
              ownerName: nameOf(p.owner_id),
              progress: projectProgress(pt),
              overdueTasks: pt.filter((t) => isOverdue({ status: t.status, dueDate: t.due_date }, today)).length,
            };
          }),
        };
        return NextResponse.json({ from, to, ...payload });
      }
    }
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Failed to build the report");
  }
}
