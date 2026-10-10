import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StageLabelOverrides } from "@/lib/lead-stages";
import type { ImportLeadRow } from "@/lib/lead-import";
import type { TargetsSummary } from "@/lib/targets-server";
import type {
  LeadActivityDto,
  LeadDto,
  LeaderboardReportRow,
  LostReport,
  PipelineReport,
  ProjectDto,
  ProjectsReport,
  ProjectWithProgress,
  DocumentDto,
  PhaseDto,
  SourcesReport,
  TaskEventDto,
  TaskListDto,
  TimeLogDto,
  StaffOption,
  TargetReportRow,
  TargetWithProgress,
  TaskDto,
  TasksReport,
} from "@/lib/targets-types";

/** React Query hooks for the Targets module. Every call goes through /api/targets/** (the tables are service-role only). */

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init.headers || {}) } : init?.headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || "Something went wrong"), { data: body as Record<string, unknown> });
  return body as T;
}

/** The extra fields an API error carried (e.g. `duplicateOf` on a duplicate-lead 409). */
export function errorData(e: unknown): Record<string, unknown> {
  return (e as { data?: Record<string, unknown> } | null)?.data ?? {};
}

const send = (method: "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
  api<{ ok: true; id?: string } & Record<string, unknown>>(url, { method, body: payload === undefined ? undefined : JSON.stringify(payload) });

const KEY = "targets";

/**
 * Refreshes only the Targets queries a change can affect (`parts` are the second part of the query
 * keys below) instead of every mounted one. Re-running the heavy summary / target-progress queries
 * after, say, ticking a task off was what made every save feel slow.
 */
function useInvalidate(...parts: string[]) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === KEY && parts.includes(q.queryKey[1] as string) });
}

type Snapshot<T> = [readonly unknown[], T | undefined][];

/** Applies `change` to the cached lists under [KEY, part, …] right away and returns the old data so a failed save can put it back. */
function optimisticUpdate<T>(qc: ReturnType<typeof useQueryClient>, part: string, change: (old: T) => T): Snapshot<T> {
  const snapshot = qc.getQueriesData<T>({ queryKey: [KEY, part] });
  qc.setQueriesData<T>({ queryKey: [KEY, part] }, (old) => (old === undefined ? old : change(old)));
  return snapshot;
}

function restore<T>(qc: ReturnType<typeof useQueryClient>, snapshot: Snapshot<T> | undefined) {
  for (const [key, data] of snapshot ?? []) qc.setQueryData(key, data);
}

const TARGET_VIEWS = ["targets", "target", "summary", "report"];
const LEAD_VIEWS = ["leads", "lead", "summary", "report"];
// A lead moving to Won changes target progress; a follow-up task may be linked to it.
const LEAD_CHANGE_VIEWS = [...LEAD_VIEWS, "targets", "target", "tasks"];
const TASK_VIEWS = ["tasks", "task", "summary", "projects", "project", "lead", "report", "feed", "task-events"];
const PROJECT_VIEWS = ["projects", "project", "summary", "tasks", "report"];

// ── Meta + summary ────────────────────────────────────────────────────────

export interface TargetsMeta {
  today: string;
  me: { email: string; employeeId: string | null; role: string };
  can: { manageLeads: boolean; manageTargets: boolean; viewAll: boolean; assignTasks: boolean; viewReports: boolean; createInvoice: boolean; createOrder: boolean };
  staff: StaffOption[];
  products: { id: string; name: string; sku: string }[];
  garmentTypes: string[];
  stageLabels: StageLabelOverrides;
}

/**
 * Staff, products, garment types, stage names and what this user may do. It rarely changes, so unlike most
 * queries here it is NOT re-read every time a screen mounts (the app-wide default) — only once it is five minutes
 * old. `lite` skips the product and rate-card reads (the invoice form only needs the staff list); `quiet` makes a
 * single attempt, for screens outside Targets where a refusal just means "this user has no Targets access".
 */
export function useTargetsMeta(opts?: { lite?: boolean; quiet?: boolean }) {
  return useQuery({
    queryKey: [KEY, "meta", opts?.lite ? "lite" : "full"],
    queryFn: () => api<TargetsMeta>(`/api/targets/meta${opts?.lite ? "?lite=1" : ""}`),
    staleTime: 5 * 60_000,
    refetchOnMount: true,
    ...(opts?.quiet ? { retry: false } : {}),
  });
}

/** `quiet` is for screens outside Targets (e.g. the Day Book) that use this only as a bonus: a user
 *  without Targets access just gets no data, with no retries. */
export function useTargetsSummary(opts?: { quiet?: boolean }) {
  return useQuery({ queryKey: [KEY, "summary"], queryFn: () => api<TargetsSummary>("/api/targets/summary"), staleTime: 30_000, ...(opts?.quiet ? { retry: false } : {}) });
}

// ── Targets ───────────────────────────────────────────────────────────────

export function useTargets(status?: "active" | "past") {
  return useQuery({
    queryKey: [KEY, "targets", status || "all"],
    queryFn: () => api<{ targets: TargetWithProgress[] }>(`/api/targets${status ? `?status=${status}` : ""}`).then((r) => r.targets),
    staleTime: 30_000,
  });
}

export function useTarget(id: string) {
  return useQuery({ queryKey: [KEY, "target", id], queryFn: () => api<{ target: TargetWithProgress }>(`/api/targets/${id}`).then((r) => r.target), staleTime: 30_000 });
}

export interface TargetInput {
  title: string;
  metric: string;
  targetValue: number;
  startDate: string;
  endDate: string;
  scope: "shop" | "person";
  assigneeIds: string[];
  productIds: string[];
  garmentTypes: string[];
  notes: string;
  status?: "active" | "draft";
}

export function useCreateTarget() {
  const invalidate = useInvalidate(...TARGET_VIEWS);
  return useMutation({ mutationFn: (input: TargetInput) => send("POST", "/api/targets", input), onSuccess: invalidate });
}

export function usePatchTarget() {
  const invalidate = useInvalidate(...TARGET_VIEWS);
  return useMutation({ mutationFn: ({ id, ...patch }: { id: string } & Partial<TargetInput> & { statusOverride?: "draft" | "cancelled" | null }) => send("PATCH", `/api/targets/${id}`, patch), onSuccess: invalidate });
}

export function useDeleteTarget() {
  const invalidate = useInvalidate(...TARGET_VIEWS);
  return useMutation({ mutationFn: (id: string) => send("DELETE", `/api/targets/${id}`), onSuccess: invalidate });
}

// ── Leads ─────────────────────────────────────────────────────────────────

export interface LeadFilters {
  stage?: string;
  owner?: string;
  q?: string;
  likely?: boolean;
  limit?: number;
}

export function useLeads(filters: LeadFilters) {
  const qs = new URLSearchParams();
  if (filters.limit) qs.set("limit", String(filters.limit));
  if (filters.stage) qs.set("stage", filters.stage);
  if (filters.owner) qs.set("owner", filters.owner);
  if (filters.q) qs.set("q", filters.q);
  if (filters.likely) qs.set("likely", "1");
  return useQuery({
    queryKey: [KEY, "leads", qs.toString()],
    queryFn: () => api<{ leads: LeadDto[]; stageCounts: Record<string, number>; total: number }>(`/api/targets/leads?${qs.toString()}`),
    staleTime: 20_000,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: [KEY, "lead", id],
    queryFn: () => api<{ lead: LeadDto; activities: LeadActivityDto[]; tasks: TaskDto[] }>(`/api/targets/leads/${id}`),
    staleTime: 15_000,
  });
}

export interface LeadInput {
  name: string;
  mobile?: string;
  source?: string;
  productInterest?: string;
  expectedValue?: number;
  likelyToClose?: boolean;
  assignedEmployeeId?: string | null;
  notes?: string;
  allowDuplicate?: boolean;
}

export function useCreateLead() {
  const invalidate = useInvalidate(...LEAD_VIEWS);
  return useMutation({ mutationFn: (input: LeadInput) => send("POST", "/api/targets/leads", input), onSuccess: invalidate });
}

export function useImportLeads() {
  const invalidate = useInvalidate(...LEAD_CHANGE_VIEWS);
  return useMutation({
    mutationFn: (rows: ImportLeadRow[]) =>
      api<{ ok: true; added: number; updated: number; skipped: number; problems: { row: number; message: string }[] }>("/api/targets/leads/import", { method: "POST", body: JSON.stringify({ rows }) }),
    onSuccess: invalidate,
  });
}

/** Every lead this person may see (up to 5000), for the Excel export — ignores the on-screen filters. */
export function fetchAllLeads() {
  return api<{ leads: LeadDto[] }>("/api/targets/leads?stage=all&limit=5000").then((r) => r.leads);
}

export function usePatchLead() {
  const qc = useQueryClient();
  const invalidate = useInvalidate(...LEAD_CHANGE_VIEWS);
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<LeadInput> & { stage?: string; lostReason?: string; wonValue?: number }) => send("PATCH", `/api/targets/leads/${id}`, patch),
    // Dragging a lead to another stage moves the card at once; a refused move (e.g. Lost without a reason) snaps back.
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: [KEY, "leads"] });
      const shown = {
        ...(patch.stage !== undefined ? { stage: patch.stage } : {}),
        ...(patch.likelyToClose !== undefined ? { likelyToClose: patch.likelyToClose } : {}),
      };
      return { snapshot: optimisticUpdate<{ leads: LeadDto[]; stageCounts: Record<string, number>; total: number }>(qc, "leads", (data) => ({ ...data, leads: data.leads.map((l) => (l.id === id ? { ...l, ...shown } : l)) })) };
    },
    onError: (_e, _vars, ctx) => restore(qc, ctx?.snapshot),
    onSettled: invalidate,
  });
}

export function useDeleteLead() {
  const invalidate = useInvalidate(...LEAD_CHANGE_VIEWS);
  return useMutation({ mutationFn: (id: string) => send("DELETE", `/api/targets/leads/${id}`), onSuccess: invalidate });
}

export function useAddLeadActivity() {
  const invalidate = useInvalidate("lead");
  return useMutation({ mutationFn: ({ id, kind, body }: { id: string; kind: "note" | "call" | "meeting"; body: string }) => send("POST", `/api/targets/leads/${id}/activities`, { kind, body }), onSuccess: invalidate });
}

export function useConvertLead() {
  const invalidate = useInvalidate(...LEAD_CHANGE_VIEWS);
  return useMutation({
    mutationFn: (id: string) => send("POST", `/api/targets/leads/${id}/convert`) as unknown as Promise<{ ok: true; customerId: string | null; orderUrl: string; invoiceUrl: string }>,
    onSuccess: invalidate,
  });
}

// ── Tasks and projects ────────────────────────────────────────────────────

export interface TaskFilters {
  assignee?: string;
  status?: "open" | "done" | "all";
  project?: string;
  group?: string;
  link?: string;
}

export function useTasks(filters: TaskFilters = {}, enabled = true) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  return useQuery({ queryKey: [KEY, "tasks", qs.toString()], enabled, queryFn: () => api<{ tasks: TaskDto[] }>(`/api/targets/tasks?${qs.toString()}`).then((r) => r.tasks), staleTime: 15_000 });
}

/** One task with its subtasks (including finished ones — the list views only load open tasks). */
export function useTask(id: string | null) {
  return useQuery({
    queryKey: [KEY, "task", id],
    enabled: !!id,
    queryFn: () => api<{ task: TaskDto; subtasks: TaskDto[] }>(`/api/targets/tasks/${id}`),
    staleTime: 10_000,
  });
}

export interface TaskInput {
  title: string;
  description?: string;
  projectId?: string | null;
  parentTaskId?: string | null;
  groupName?: string;
  assigneeId?: string | null;
  priority?: string;
  status?: string;
  startDate?: string | null;
  dueDate?: string | null;
  checklist?: { text: string; done: boolean }[];
  linkType?: string | null;
  linkId?: string | null;
  taskListId?: string | null;
  phaseId?: string | null;
  tags?: string[];
  durationHours?: number | null;
  completionPct?: number;
  reminder?: string;
  dependsOn?: string[];
}

export function useCreateTask() {
  const invalidate = useInvalidate(...TASK_VIEWS);
  return useMutation({ mutationFn: (input: TaskInput) => send("POST", "/api/targets/tasks", input), onSuccess: invalidate });
}

export function usePatchTask() {
  const qc = useQueryClient();
  const invalidate = useInvalidate(...TASK_VIEWS);
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<TaskInput>) => send("PATCH", `/api/targets/tasks/${id}`, patch),
    // Ticking a task off, changing its status or owner shows up at once; a failed save puts it back.
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: [KEY, "tasks"] });
      const shown = {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
        ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
      };
      return { snapshot: optimisticUpdate<TaskDto[]>(qc, "tasks", (list) => list.map((t) => (t.id === id ? { ...t, ...shown } : t))) };
    },
    onError: (_e, _vars, ctx) => restore(qc, ctx?.snapshot),
    onSettled: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidate(...TASK_VIEWS);
  return useMutation({ mutationFn: (id: string) => send("DELETE", `/api/targets/tasks/${id}`), onSuccess: invalidate });
}

export function useProjects() {
  return useQuery({ queryKey: [KEY, "projects"], queryFn: () => api<{ projects: ProjectWithProgress[] }>("/api/targets/projects").then((r) => r.projects), staleTime: 30_000 });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: [KEY, "project", id],
    enabled: !!id,
    queryFn: () => api<{ project: ProjectWithProgress; tasks: TaskDto[]; lists: TaskListDto[]; phases: PhaseDto[]; memberIds: string[]; canManage: boolean }>(`/api/targets/projects/${id}`),
    staleTime: 15_000,
  });
}

export interface ProjectInput {
  name: string;
  description?: string;
  ownerId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string;
  targetId?: string | null;
}

export function useCreateProject() {
  const invalidate = useInvalidate(...PROJECT_VIEWS);
  return useMutation({ mutationFn: (input: ProjectInput) => send("POST", "/api/targets/projects", input), onSuccess: invalidate });
}

export function usePatchProject() {
  const invalidate = useInvalidate(...PROJECT_VIEWS);
  return useMutation({ mutationFn: ({ id, ...patch }: { id: string } & Partial<ProjectInput>) => send("PATCH", `/api/targets/projects/${id}`, patch), onSuccess: invalidate });
}

export function useDeleteProject() {
  const invalidate = useInvalidate(...PROJECT_VIEWS);
  return useMutation({ mutationFn: (id: string) => send("DELETE", `/api/targets/projects/${id}`), onSuccess: invalidate });
}

export type { ProjectDto };

// ── Reports ───────────────────────────────────────────────────────────────

interface Range {
  from: string;
  to: string;
}

type ReportData = {
  "target-vs-achievement": { rows: TargetReportRow[] };
  leaderboard: { rows: LeaderboardReportRow[] };
  pipeline: PipelineReport;
  sources: SourcesReport;
  lost: LostReport;
  tasks: TasksReport;
  projects: ProjectsReport;
};

export function useTargetsReport<K extends keyof ReportData>(kind: K, range?: Partial<Range>, enabled = true) {
  const qs = new URLSearchParams();
  if (range?.from) qs.set("from", range.from);
  if (range?.to) qs.set("to", range.to);
  return useQuery({
    queryKey: [KEY, "report", kind, qs.toString()],
    enabled,
    queryFn: () => api<ReportData[K] & Range>(`/api/targets/reports/${kind}?${qs.toString()}`),
    staleTime: 30_000,
  });
}

// ── Workspace: task lists, phases, members, comments, documents, time ─────

export function useCreateTaskList() {
  const invalidate = useInvalidate("project", "tasks");
  return useMutation({ mutationFn: (input: { projectId: string; name: string }) => send("POST", "/api/targets/task-lists", input), onSuccess: invalidate });
}
export function usePatchTaskList() {
  const invalidate = useInvalidate("project", "tasks");
  return useMutation({ mutationFn: ({ id, ...patch }: { id: string; name?: string; sortOrder?: number }) => send("PATCH", `/api/targets/task-lists/${id}`, patch), onSuccess: invalidate });
}
export function useDeleteTaskList() {
  const invalidate = useInvalidate("project", "tasks");
  return useMutation({ mutationFn: (id: string) => send("DELETE", `/api/targets/task-lists/${id}`), onSuccess: invalidate });
}

export interface PhaseInput {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  status?: string;
}
export function useCreatePhase() {
  const invalidate = useInvalidate("project");
  return useMutation({ mutationFn: (input: PhaseInput & { projectId: string }) => send("POST", "/api/targets/phases", input), onSuccess: invalidate });
}
export function usePatchPhase() {
  const invalidate = useInvalidate("project");
  return useMutation({ mutationFn: ({ id, ...patch }: { id: string } & Partial<PhaseInput>) => send("PATCH", `/api/targets/phases/${id}`, patch), onSuccess: invalidate });
}
export function useDeletePhase() {
  const invalidate = useInvalidate("project", "tasks");
  return useMutation({ mutationFn: (id: string) => send("DELETE", `/api/targets/phases/${id}`), onSuccess: invalidate });
}

export function useSetProjectMembers() {
  const invalidate = useInvalidate("project", "projects", "tasks");
  return useMutation({
    mutationFn: ({ projectId, employeeIds }: { projectId: string; employeeIds: string[] }) =>
      api<{ ok: true }>(`/api/targets/projects/${projectId}/members`, { method: "PUT", body: JSON.stringify({ employeeIds }) }),
    onSuccess: invalidate,
  });
}

export function useTaskEvents(taskId: string | null, enabled = true) {
  return useQuery({ queryKey: [KEY, "task-events", taskId], enabled: enabled && !!taskId, queryFn: () => api<{ events: TaskEventDto[] }>(`/api/targets/tasks/${taskId}/events`).then((r) => r.events), staleTime: 5_000 });
}
export function useAddComment() {
  const invalidate = useInvalidate("task-events", "feed");
  return useMutation({ mutationFn: ({ taskId, body }: { taskId: string; body: string }) => send("POST", `/api/targets/tasks/${taskId}/events`, { body }), onSuccess: invalidate });
}
export function useProjectFeed(projectId: string) {
  return useQuery({ queryKey: [KEY, "feed", projectId], queryFn: () => api<{ events: TaskEventDto[] }>(`/api/targets/projects/${projectId}/feed`).then((r) => r.events), staleTime: 15_000 });
}

export function useDocuments(scope: { projectId?: string; taskId?: string }, enabled = true) {
  const qs = scope.taskId ? `taskId=${scope.taskId}` : `projectId=${scope.projectId}`;
  return useQuery({ queryKey: [KEY, "documents", qs], enabled: enabled && !!(scope.taskId || scope.projectId), queryFn: () => api<{ documents: DocumentDto[] }>(`/api/targets/documents?${qs}`).then((r) => r.documents), staleTime: 15_000 });
}
export function useAddDocument() {
  const invalidate = useInvalidate("documents");
  return useMutation({ mutationFn: (input: { projectId?: string | null; taskId?: string | null; name: string; url: string }) => send("POST", "/api/targets/documents", input), onSuccess: invalidate });
}
export function useDeleteDocument() {
  const invalidate = useInvalidate("documents");
  return useMutation({ mutationFn: (id: string) => send("DELETE", `/api/targets/documents/${id}`), onSuccess: invalidate });
}

export interface TimeLogFilters {
  from?: string;
  to?: string;
  employee?: string;
  project?: string;
  task?: string;
}
export function useTimeLogs(filters: TimeLogFilters = {}, enabled = true) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  return useQuery({ queryKey: [KEY, "time-logs", qs.toString()], enabled, queryFn: () => api<{ logs: TimeLogDto[] }>(`/api/targets/time-logs?${qs.toString()}`).then((r) => r.logs), staleTime: 15_000 });
}
export function useAddTimeLog() {
  const invalidate = useInvalidate("time-logs", "task", "project", "report");
  return useMutation({
    mutationFn: (input: { taskId?: string | null; projectId?: string | null; logDate: string; hours: number; note?: string; employeeId?: string | null }) => send("POST", "/api/targets/time-logs", input),
    onSuccess: invalidate,
  });
}
export function useDeleteTimeLog() {
  const invalidate = useInvalidate("time-logs", "task", "project", "report");
  return useMutation({ mutationFn: (id: string) => send("DELETE", `/api/targets/time-logs/${id}`), onSuccess: invalidate });
}
