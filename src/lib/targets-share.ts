import { normalizeIndianMobile } from "@/lib/business-rules";
import { inr } from "@/lib/format";
import { stageLabel, type StageLabelOverrides } from "@/lib/lead-stages";
import { describeTarget, formatMetricValue, TARGET_STATUS_LABELS } from "@/lib/targets";
import { checklistProgress, isFinished, PROJECT_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/work-tasks";
import type { LeadDto, LeaderboardReportRow, ProjectWithProgress, TargetWithProgress, TaskDto } from "@/lib/targets-types";

/**
 * "Share" for the Targets module: turns a task, project, lead, target, report or a whole list into a short message
 * that opens in WhatsApp or the mail app already typed. Same approach as invoices, reports and payslips: wa.me /
 * mailto links, so it needs no setup and sends nothing by itself (and can carry text only, never a file).
 *
 * Messages are written in WhatsApp style (*bold*); `plainText` takes the stars out for email. Every message ends with
 * an "Open:" link that a logged-in team member can follow to the item in the app.
 */

export interface ShareMessage {
  /** The email subject line. */
  subject: string;
  /** The body, as WhatsApp will show it. */
  text: string;
}

export interface ShareCtx {
  /** The app's address (https://…) — the "Open:" link is built on it. Empty = leave the link out. */
  origin: string;
  /** Today's shop-local date, YYYY-MM-DD. */
  today: string;
  nameOf: (id: string | null | undefined) => string;
}

/** Rows in a digest ("Overdue tasks", a lead stage…) before it ends with "+N more". */
export const MAX_SHARE_ROWS = 15;
/** Keeps the whole message — and the wa.me / mailto link made from it — a sane length. */
const MAX_TEXT = 1800;

// ── Small text helpers ────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const oneLine = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "9 Oct" for a date in `today`'s year, "9 Oct 2027" otherwise — read straight off the YYYY-MM-DD text so the viewer's timezone can't shift it. */
export function shareDate(iso: string | null | undefined, today?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  if (!m || !month) return iso ?? "";
  const sameYear = !!today && today.slice(0, 4) === m[1];
  return `${Number(m[3])} ${month}${sameYear ? "" : ` ${m[1]}`}`;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

/** "9 Oct (overdue by 2 days)", "10 Oct (today)", "11 Oct (tomorrow)", "20 Oct". A finished task just shows its date. */
export function shareDue(due: string | null | undefined, today: string, finished = false): string {
  if (!due) return "Not set";
  const date = shareDate(due, today);
  if (finished) return date;
  const diff = dayDiff(due, today);
  if (diff < 0) return `${date} (overdue by ${plural(-diff, "day")})`;
  if (diff === 0) return `${date} (today)`;
  if (diff === 1) return `${date} (tomorrow)`;
  return date;
}

/** The short form for list rows: "overdue by 2 days", "due today", "due tomorrow", "due 20 Oct". Empty when there's no date. */
function dueTag(due: string | null | undefined, today: string, finished: boolean): string {
  if (!due) return "";
  if (finished) return `due ${shareDate(due, today)}`;
  const diff = dayDiff(due, today);
  if (diff < 0) return `overdue by ${plural(-diff, "day")}`;
  if (diff === 0) return "due today";
  if (diff === 1) return "due tomorrow";
  return `due ${shareDate(due, today)}`;
}

const openLine = (ctx: Pick<ShareCtx, "origin">, path: string): string[] => (ctx.origin ? [`Open: ${ctx.origin}${path}`] : []);

/** A header, as many bullet rows as fit, "+N more", then the footer — never longer than MAX_TEXT. */
function digest(header: string[], rows: string[], footer: string[], maxRows = MAX_SHARE_ROWS): string {
  const base = [...header, ...footer].join("\n").length;
  let used = base + 60; // room for the "+N more" line
  const kept: string[] = [];
  for (const row of rows) {
    if (kept.length >= maxRows || used + row.length + 1 > MAX_TEXT) break;
    kept.push(row);
    used += row.length + 1;
  }
  const more = rows.length - kept.length;
  return [...header, ...kept, ...(more > 0 ? [`+${more} more — open the app for the full list`] : []), ...footer].join("\n");
}

// ── Links ─────────────────────────────────────────────────────────────────

/** A 10-digit Indian mobile, or null — the only kind wa.me/91… can open. */
export function whatsAppNumber(mobile: string | null | undefined): string | null {
  const m = normalizeIndianMobile(mobile || "");
  return m.length === 10 ? m : null;
}

/** WhatsApp's own contact picker with the text typed in — for sending to anyone (same as the report share). */
export function waPickerHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** A chat with this person's number with the text typed in; null when they have no number WhatsApp can open. */
export function waChatHref(mobile: string | null | undefined, text: string): string | null {
  const m = whatsAppNumber(mobile);
  return m ? `https://wa.me/91${m}?text=${encodeURIComponent(text)}` : null;
}

/** WhatsApp markup (*bold*) taken out, for email and anywhere the stars would just look odd. */
export function plainText(text: string): string {
  return text.replace(/\*([^*\n]+)\*/g, "$1");
}

/** Mail bodies much past this can be cut off by the mail app / the browser's link limit. */
const MAX_MAIL_BODY = 1900;

/** A mail-app link with the subject and body filled in. `to` is optional — without it the person types the address. */
export function mailtoHref(to: string | null | undefined, msg: ShareMessage): string {
  const body = clip(plainText(msg.text), MAX_MAIL_BODY).replace(/\r?\n/g, "\r\n");
  const address = to ? encodeURIComponent(to.trim()).replace(/%40/g, "@") : "";
  return `mailto:${address}?subject=${encodeURIComponent(clip(oneLine(msg.subject), 120))}&body=${encodeURIComponent(body)}`;
}

// ── Who it can be sent to ─────────────────────────────────────────────────

export interface ShareContact {
  id: string;
  name: string;
  role: string;
  /** As stored on the employee record; may not be a number WhatsApp can open (the dialog checks). */
  mobile: string | null;
  /** The login email of the person's account, if they have one and the viewer may see it. */
  email: string | null;
}

/**
 * The people the Share panel lists: active staff other than the viewer. Emails are the logins linked to each employee
 * and are only filled in when `includeEmails` — user_roles is locked down per row, so they go to those who can see
 * everyone's work (admins, managers) and nobody else.
 */
export function buildShareContacts(
  employees: { id: string; name: string; role: string; mobile: string | null; active?: boolean }[],
  logins: { email: string; linked_employee_id: string | null }[],
  opts: { viewerEmployeeId: string | null; includeEmails: boolean }
): ShareContact[] {
  const emailOf = new Map<string, string>();
  if (opts.includeEmails) {
    for (const l of logins) {
      const email = (l.email || "").trim();
      if (l.linked_employee_id && email && !emailOf.has(l.linked_employee_id)) emailOf.set(l.linked_employee_id, email);
    }
  }
  return employees
    .filter((e) => e.active !== false && e.id !== opts.viewerEmployeeId)
    .map((e) => ({ id: e.id, name: e.name, role: e.role, mobile: (e.mobile || "").trim() || null, email: emailOf.get(e.id) ?? null }));
}

// ── Messages ──────────────────────────────────────────────────────────────

export function taskShareMessage(task: TaskDto, ctx: ShareCtx, extra?: { projectName?: string | null }): ShareMessage {
  const title = oneLine(task.title) || "Untitled task";
  const status = TASK_STATUS_LABELS[task.status as keyof typeof TASK_STATUS_LABELS] ?? task.status;
  const priority = TASK_PRIORITY_LABELS[task.priority as keyof typeof TASK_PRIORITY_LABELS] ?? task.priority;
  const lines = [`📝 *Task: ${title}*`, `Owner: ${ctx.nameOf(task.assigneeId)} · ${priority} priority · ${status}`, `Due: ${shareDue(task.dueDate, ctx.today, isFinished(task.status))}`];
  if (extra?.projectName) lines.push(`Project: ${oneLine(extra.projectName)}`);
  if (task.linkType === "lead" && task.linkLabel) lines.push(`For lead: ${oneLine(task.linkLabel)}`);
  const steps = checklistProgress(task.checklist);
  if (steps.total) lines.push(`Steps: ${steps.done} of ${steps.total} done`);
  const note = oneLine(task.description);
  if (note) lines.push(`Note: ${clip(note, 240)}`);
  lines.push(...openLine(ctx, `/targets?tab=tasks&task=${task.id}`));
  return { subject: `Task: ${title}`, text: lines.join("\n") };
}

export function projectShareMessage(project: ProjectWithProgress, tasks: TaskDto[], ctx: ShareCtx): ShareMessage {
  const name = oneLine(project.name) || "Untitled project";
  const status = PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS] ?? project.status;
  const header = [`📁 *Project: ${name}*${project.projectNo != null ? ` (P-${project.projectNo})` : ""}`, `Owner: ${ctx.nameOf(project.ownerId)} · ${status}`];
  if (project.startDate || project.endDate) header.push(`Dates: ${[project.startDate, project.endDate].map((d) => (d ? shareDate(d, ctx.today) : "…")).join(" – ")}`);
  const { done, total, pct } = project.progress;
  header.push(`Progress: ${pct}% done (${done} of ${plural(total, "task")})${project.overdueTasks > 0 ? ` · ${project.overdueTasks} overdue` : ""}`);
  const note = oneLine(project.description);
  if (note) header.push(`Note: ${clip(note, 200)}`);

  const open = tasks
    .filter((t) => !t.parentTaskId && !isFinished(t.status))
    .sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"));
  const rows = open.map((t) => taskRow(t, ctx, true));
  if (rows.length) header.push("Open tasks:");
  return { subject: `Project: ${name}`, text: digest(header, rows, openLine(ctx, `/targets/projects/${project.id}`), 8) };
}

export function leadShareMessage(lead: LeadDto, ctx: ShareCtx, opts?: { labels?: StageLabelOverrides; nextFollowUp?: { title: string; dueDate: string | null } | null }): ShareMessage {
  const name = oneLine(lead.name) || "Unnamed lead";
  const lines = [`👤 *Lead: ${name}*`];
  if (lead.mobile) lines.push(`Phone: ${lead.mobile}`);
  lines.push(`Stage: ${stageLabel(lead.stage, opts?.labels)}${lead.likelyToClose ? " · ★ Likely to close" : ""}`);
  const wants = [oneLine(lead.productInterest) && `Wants: ${oneLine(lead.productInterest)}`, lead.expectedValue > 0 && `Expected: ${inr(lead.expectedValue)}`].filter(Boolean);
  if (wants.length) lines.push(wants.join(" · "));
  lines.push(`Owner: ${ctx.nameOf(lead.assignedEmployeeId)}${lead.source ? ` · Came from: ${oneLine(lead.source)}` : ""}`);
  if (lead.stage === "won") lines.push(`Won: ${inr(lead.wonValue)}`);
  if (lead.stage === "lost" && lead.lostReason) lines.push(`Lost because: ${oneLine(lead.lostReason)}`);
  const next = opts?.nextFollowUp;
  if (next) lines.push(`Next follow-up: ${oneLine(next.title)}${next.dueDate ? ` — ${shareDate(next.dueDate, ctx.today)}` : ""}`);
  const note = oneLine(lead.notes);
  if (note) lines.push(`Note: ${clip(note, 240)}`);
  lines.push(...openLine(ctx, `/targets/leads/${lead.id}`));
  return { subject: `Lead: ${name}`, text: lines.join("\n") };
}

export function targetShareMessage(target: TargetWithProgress, ctx: ShareCtx, opts?: { productNames?: string[] }): ShareMessage {
  const p = target.progress;
  const title = oneLine(target.title) || "Target";
  const { headline } = describeTarget(target.metric, p);
  const running = p.status === "on_track" || p.status === "at_risk";
  const lines = [`🎯 *${title}*`, `${headline} (${Math.round(p.pct)}%)`, `Status: ${TARGET_STATUS_LABELS[p.status]}${running ? ` · ${plural(p.daysLeft, "day")} left` : ""}`];
  if (running) lines.push(`Should be at ${formatMetricValue(target.metric, p.expected)} by now · heading for ${formatMetricValue(target.metric, p.projected)}`);
  if (p.likely > 0) lines.push(`Likely to close: +${formatMetricValue(target.metric, p.likely)}`);
  const who = target.scope === "shop" ? "Whole shop" : target.assigneeIds.map((id) => ctx.nameOf(id)).join(", ") || "Nobody yet";
  lines.push(`For: ${who} · ${shareDate(target.startDate, ctx.today)} – ${shareDate(target.endDate, ctx.today)}`);
  const only = [...target.garmentTypes, ...(opts?.productNames ?? [])];
  if (only.length) lines.push(`Counting only: ${clip(only.join(", "), 120)}`);
  lines.push(...openLine(ctx, `/targets/${target.id}`));
  return { subject: `Target: ${title}`, text: lines.join("\n") };
}

export function leaderboardShareMessage(rows: LeaderboardReportRow[], range: { from: string; to: string }, ctx: Pick<ShareCtx, "origin" | "today">): ShareMessage {
  const title = `Scoreboard — ${shareDate(range.from, ctx.today)} to ${shareDate(range.to, ctx.today)}`;
  const lines = rows.map((r, i) => `${i + 1}. ${clip(oneLine(r.name) || "Not credited to anyone", 40)} — ${inr(r.value)} · ${plural(r.sales, "sale")}${r.leadsWon > 0 ? ` · ${r.leadsWon} won` : ""}`);
  return { subject: title, text: digest([`🏆 *${title}*`], lines, openLine(ctx, "/reports/sales-leaderboard"), 10) };
}

/** Any report as a table: the first cell is each row's name, the next few are shown as "label value". */
export function reportShareMessage(
  input: { title: string; period?: string; summaryLines?: string[]; headers: string[]; rows: string[][]; path: string },
  ctx: Pick<ShareCtx, "origin">
): ShareMessage {
  const header = [`📊 *${oneLine(input.title)}*`];
  if (input.period) header.push(`Period: ${input.period}`);
  header.push(...(input.summaryLines ?? []).map(oneLine).filter(Boolean));
  const rows = input.rows.map((cells) => {
    const detail = cells
      .slice(1, 4)
      .map((c, i) => `${input.headers[i + 1]} ${c}`)
      .join(" · ");
    return `• ${clip(oneLine(cells[0]), 60)}${detail ? ` — ${detail}` : ""}`;
  });
  return { subject: oneLine(input.title), text: digest(header, rows, openLine(ctx, input.path)) };
}

function taskRow(t: TaskDto, ctx: ShareCtx, showOwner: boolean): string {
  const parts = [showOwner ? ctx.nameOf(t.assigneeId) : "", dueTag(t.dueDate, ctx.today, isFinished(t.status))].filter(Boolean);
  return `• ${clip(oneLine(t.title), 80)}${parts.length ? ` — ${parts.join(" · ")}` : ""}`;
}

/** A list of tasks as one message: "Overdue (3)", "Due today", a project's open tasks… Pass top-level tasks only. */
export function taskListShareMessage(title: string, tasks: TaskDto[], ctx: ShareCtx, opts?: { showOwner?: boolean; path?: string }): ShareMessage {
  const heading = `${title} (${tasks.length})`;
  const rows = tasks.map((t) => taskRow(t, ctx, opts?.showOwner !== false));
  return { subject: heading, text: digest([`📝 *${heading}*`], rows, openLine(ctx, opts?.path ?? "/targets?tab=tasks")) };
}

/** A list of leads as one message: a stage, "Likely to close", this month's… `showOwner: false` for someone who only sees their own. */
export function leadListShareMessage(title: string, leads: LeadDto[], ctx: ShareCtx, opts?: { labels?: StageLabelOverrides; path?: string; showOwner?: boolean }): ShareMessage {
  const heading = `${title} (${leads.length})`;
  const rows = leads.map((l) => {
    const parts = [stageLabel(l.stage, opts?.labels), oneLine(l.productInterest), l.expectedValue > 0 ? inr(l.expectedValue) : "", l.likelyToClose ? "★" : "", opts?.showOwner === false ? "" : ctx.nameOf(l.assignedEmployeeId)].filter(Boolean);
    return `• ${clip(oneLine(l.name) || "Unnamed", 40)} — ${parts.join(" · ")}`;
  });
  return { subject: heading, text: digest([`👥 *${heading}*`], rows, openLine(ctx, opts?.path ?? "/targets?tab=leads")) };
}
