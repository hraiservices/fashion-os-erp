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
  SourcesReport,
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

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY] });
}

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

export function useTargetsMeta() {
  return useQuery({ queryKey: [KEY, "meta"], queryFn: () => api<TargetsMeta>("/api/targets/meta"), staleTime: 5 * 60_000 });
}

export function useTargetsSummary() {
  return useQuery({ queryKey: [KEY, "summary"], queryFn: () => api<TargetsSummary>("/api/targets/summary"), staleTime: 30_000 });
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
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: TargetInput) => send("POST", "/api/targets", input), onSuccess: invalidate });
}

export function usePatchTarget() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, ...patch }: { id: string } & Partial<TargetInput> & { statusOverride?: "draft" | "cancelled" | null }) => send("PATCH", `/api/targets/${id}`, patch), onSuccess: invalidate });
}

export function useDeleteTarget() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => send("DELETE", `/api/targets/${id}`), onSuccess: invalidate });
}

// ── Leads ─────────────────────────────────────────────────────────────────

export interface LeadFilters {
  stage?: string;
  owner?: string;
  q?: string;
  likely?: boolean;
}

export function useLeads(filters: LeadFilters) {
  const qs = new URLSearchParams();
  if (filters.stage) qs.set("stage", filters.stage);
  if (filters.owner) qs.set("owner", filters.owner);
  if (filters.q) qs.set("q", filters.q);
  if (filters.likely) qs.set("likely", "1");
  return useQuery({
    queryKey: [KEY, "leads", qs.toString()],
    queryFn: () => api<{ leads: LeadDto[]; stageCounts: Record<string, number> }>(`/api/targets/leads?${qs.toString()}`),
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
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: LeadInput) => send("POST", "/api/targets/leads", input), onSuccess: invalidate });
}

export function useImportLeads() {
  const invalidate = useInvalidate();
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
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<LeadInput> & { stage?: string; lostReason?: string; wonValue?: number }) => send("PATCH", `/api/targets/leads/${id}`, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteLead() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => send("DELETE", `/api/targets/leads/${id}`), onSuccess: invalidate });
}

export function useAddLeadActivity() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, kind, body }: { id: string; kind: "note" | "call" | "meeting"; body: string }) => send("POST", `/api/targets/leads/${id}/activities`, { kind, body }), onSuccess: invalidate });
}

export function useConvertLead() {
  const invalidate = useInvalidate();
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

export function useTasks(filters: TaskFilters = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
  return useQuery({ queryKey: [KEY, "tasks", qs.toString()], queryFn: () => api<{ tasks: TaskDto[] }>(`/api/targets/tasks?${qs.toString()}`).then((r) => r.tasks), staleTime: 15_000 });
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
}

export function useCreateTask() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: TaskInput) => send("POST", "/api/targets/tasks", input), onSuccess: invalidate });
}

export function usePatchTask() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, ...patch }: { id: string } & Partial<TaskInput>) => send("PATCH", `/api/targets/tasks/${id}`, patch), onSuccess: invalidate });
}

export function useDeleteTask() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => send("DELETE", `/api/targets/tasks/${id}`), onSuccess: invalidate });
}

export function useProjects() {
  return useQuery({ queryKey: [KEY, "projects"], queryFn: () => api<{ projects: ProjectWithProgress[] }>("/api/targets/projects").then((r) => r.projects), staleTime: 30_000 });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: [KEY, "project", id],
    queryFn: () => api<{ project: ProjectWithProgress; tasks: TaskDto[] }>(`/api/targets/projects/${id}`),
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
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: ProjectInput) => send("POST", "/api/targets/projects", input), onSuccess: invalidate });
}

export function usePatchProject() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, ...patch }: { id: string } & Partial<ProjectInput>) => send("PATCH", `/api/targets/projects/${id}`, patch), onSuccess: invalidate });
}

export function useDeleteProject() {
  const invalidate = useInvalidate();
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

export function useTargetsReport<K extends keyof ReportData>(kind: K, range?: Partial<Range>) {
  const qs = new URLSearchParams();
  if (range?.from) qs.set("from", range.from);
  if (range?.to) qs.set("to", range.to);
  return useQuery({
    queryKey: [KEY, "report", kind, qs.toString()],
    queryFn: () => api<ReportData[K] & Range>(`/api/targets/reports/${kind}?${qs.toString()}`),
    staleTime: 30_000,
  });
}
