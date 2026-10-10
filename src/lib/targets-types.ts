import type { Database } from "@/lib/supabase/database.types";
import type { PipelineRow, SourceRow, TargetMetric, TargetOverride, TargetProgress, TargetScope } from "@/lib/targets";
import type { AgeBucket, TaskLoadRow } from "@/lib/targets-reports";
import { parseChecklist, type ChecklistItem, type TaskLinkType } from "@/lib/work-tasks";

/** Camel-case shapes the Targets API returns and the screens consume, plus the row mappers. */

type Tables = Database["public"]["Tables"];

export interface TargetDto {
  id: string;
  title: string;
  metric: TargetMetric;
  targetValue: number;
  startDate: string;
  endDate: string;
  scope: TargetScope;
  assigneeIds: string[];
  productIds: string[];
  garmentTypes: string[];
  statusOverride: TargetOverride;
  notes: string;
  createdBy: string | null;
  createdAt: string;
}

export interface TargetWithProgress extends TargetDto {
  progress: TargetProgress;
}

export interface LeadDto {
  id: string;
  name: string;
  mobile: string;
  customerId: string | null;
  source: string;
  productInterest: string;
  expectedValue: number;
  stage: string;
  likelyToClose: boolean;
  assignedEmployeeId: string | null;
  lostReason: string;
  wonValue: number;
  notes: string;
  wonAt: string | null;
  lostAt: string | null;
  orderId: string | null;
  invoiceId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** The soonest open task linked to this lead — "next follow-up". Filled in by the list route. */
  nextFollowUp?: { id: string; title: string; dueDate: string | null } | null;
}

export interface LeadActivityDto {
  id: string;
  leadId: string;
  kind: string;
  body: string;
  createdBy: string | null;
  createdAt: string;
}

export interface TaskDto {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  parentTaskId: string | null;
  groupName: string;
  assigneeId: string | null;
  priority: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  checklist: ChecklistItem[];
  linkType: TaskLinkType | null;
  linkId: string | null;
  /** Human label for the linked thing (lead name, etc.), resolved by the list route. */
  linkLabel?: string | null;
  /** Readable id (T-34); null until the workspace migration has run. */
  taskNo: number | null;
  taskListId: string | null;
  phaseId: string | null;
  tags: string[];
  durationHours: number | null;
  completionPct: number;
  reminder: string;
  dependsOn: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDto {
  id: string;
  name: string;
  description: string;
  ownerId: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  targetId: string | null;
  /** Readable id (P-12); null until the workspace migration has run. */
  projectNo: number | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ProjectWithProgress extends ProjectDto {
  progress: { done: number; total: number; pct: number };
  overdueTasks: number;
}

export interface StaffOption {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

export function mapTargetRow(r: Tables["sales_targets"]["Row"]): TargetDto {
  return {
    id: r.id,
    title: r.title,
    metric: r.metric as TargetMetric,
    targetValue: Number(r.target_value),
    startDate: r.start_date,
    endDate: r.end_date,
    scope: r.scope === "shop" ? "shop" : "person",
    assigneeIds: r.assignee_ids || [],
    productIds: r.product_ids || [],
    garmentTypes: r.garment_types || [],
    statusOverride: (r.status_override as TargetOverride) ?? null,
    notes: r.notes || "",
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export function mapLeadRow(r: Tables["leads"]["Row"]): LeadDto {
  return {
    id: r.id,
    name: r.name,
    mobile: r.mobile || "",
    customerId: r.customer_id,
    source: r.source || "",
    productInterest: r.product_interest || "",
    expectedValue: Number(r.expected_value) || 0,
    stage: r.stage,
    likelyToClose: !!r.likely_to_close,
    assignedEmployeeId: r.assigned_employee_id,
    lostReason: r.lost_reason || "",
    wonValue: Number(r.won_value) || 0,
    notes: r.notes || "",
    wonAt: r.won_at,
    lostAt: r.lost_at,
    orderId: r.order_id,
    invoiceId: r.invoice_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapActivityRow(r: Tables["lead_activities"]["Row"]): LeadActivityDto {
  return { id: r.id, leadId: r.lead_id, kind: r.kind, body: r.body || "", createdBy: r.created_by, createdAt: r.created_at };
}

export function mapTaskRow(r: Tables["work_tasks"]["Row"]): TaskDto {
  return {
    id: r.id,
    title: r.title,
    description: r.description || "",
    projectId: r.project_id,
    parentTaskId: r.parent_task_id,
    groupName: r.group_name || "",
    assigneeId: r.assignee_id,
    priority: r.priority,
    status: r.status,
    startDate: r.start_date,
    dueDate: r.due_date,
    completedAt: r.completed_at,
    checklist: parseChecklist(r.checklist),
    linkType: (r.link_type as TaskLinkType | null) ?? null,
    linkId: r.link_id,
    taskNo: r.task_no ?? null,
    taskListId: r.task_list_id ?? null,
    phaseId: r.phase_id ?? null,
    tags: r.tags ?? [],
    durationHours: r.duration_hours != null ? Number(r.duration_hours) : null,
    completionPct: r.status === "done" ? 100 : r.completion_pct ?? 0,
    reminder: r.reminder ?? "none",
    dependsOn: r.depends_on ?? [],
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapProjectRow(r: Tables["work_projects"]["Row"]): ProjectDto {
  return {
    id: r.id,
    name: r.name,
    description: r.description || "",
    ownerId: r.owner_id,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
    targetId: r.target_id,
    projectNo: r.project_no ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

// ── Report payloads (what /api/targets/reports/[kind] returns) ────────────

export interface ReportRange {
  from: string;
  to: string;
}

export interface TargetReportRow extends TargetWithProgress {
  assigneeNames: string[];
}

export interface LeaderboardReportRow {
  personId: string | null;
  name: string;
  value: number;
  sales: number;
  leadsWon: number;
  wonValue: number;
  targetsHit: number;
  incentive: number;
}

export interface PipelineReport {
  rows: PipelineRow[];
  openCount: number;
  openValue: number;
  likelyValue: number;
  byOwner: { ownerId: string | null; name: string; count: number; value: number; likelyValue: number }[];
  likelyLeads: { id: string; name: string; value: number; stage: string; owner: string }[];
}

export interface SourcesReport {
  rows: SourceRow[];
  winRate: number | null;
  totalLeads: number;
}

export interface LostReport {
  reasons: { reason: string; count: number }[];
  leads: { id: string; name: string; reason: string; value: number; owner: string; lostOn: string | null }[];
}

export interface TasksReport {
  rows: (TaskLoadRow & { name: string })[];
  ageBuckets: AgeBucket[];
}

export interface ProjectsReport {
  projects: (ProjectWithProgress & { ownerName: string })[];
}

// ── Workspace extras ──────────────────────────────────────────────────────

export interface TaskListDto {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
}
export interface PhaseDto {
  id: string;
  projectId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  sortOrder: number;
}
export interface TaskEventDto {
  id: string;
  projectId: string | null;
  taskId: string | null;
  kind: string;
  body: string;
  createdBy: string | null;
  createdAt: string;
  /** Task title, filled in for the project Feed. */
  taskTitle?: string | null;
}
export interface DocumentDto {
  id: string;
  projectId: string | null;
  taskId: string | null;
  name: string;
  url: string;
  createdBy: string | null;
  createdAt: string;
}
export interface TimeLogDto {
  id: string;
  taskId: string | null;
  projectId: string | null;
  employeeId: string | null;
  logDate: string;
  hours: number;
  note: string;
  createdAt: string;
}
