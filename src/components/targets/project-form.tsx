"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, FolderKanban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldGroup, FormCard, FormShell, SectionHeading, pillClass } from "@/components/targets/form-ui";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/work-tasks";
import type { ProjectDto } from "@/lib/targets-types";
import { useCreateProject, useDeleteProject, usePatchProject, type TargetsMeta } from "@/hooks/use-targets";
import { cn } from "@/lib/utils";

const NONE = "none";

/** Add or edit a light project as a full page: name, owner, dates, status. % done comes from its tasks. */
export function ProjectForm({ meta, project }: { meta: TargetsMeta | undefined; project?: ProjectDto | null }) {
  const router = useRouter();
  const create = useCreateProject();
  const patch = usePatchProject();
  const del = useDeleteProject();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [owner, setOwner] = useState(project ? project.ownerId ?? NONE : meta?.me.employeeId ?? NONE);
  const [start, setStart] = useState(project?.startDate ?? meta?.today ?? "");
  const [end, setEnd] = useState(project?.endDate ?? "");
  const [status, setStatus] = useState(project?.status ?? "active");
  const [nameError, setNameError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const staff = (meta?.staff ?? []).filter((s) => s.active);
  const busy = create.isPending || patch.isPending || del.isPending;
  const backHref = project ? `/targets/projects/${project.id}` : "/targets?tab=projects";

  function save() {
    if (!name.trim()) {
      setNameError("Give the project a name");
      return;
    }
    const payload = { name: name.trim(), description: description.trim(), ownerId: owner === NONE ? null : owner, startDate: start || null, endDate: end || null, status };
    const done = () => {
      toast.success(project ? "Project saved" : "Project added");
      router.push(backHref);
    };
    const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't save the project");
    if (project) patch.mutate({ id: project.id, ...payload }, { onSuccess: done, onError: fail });
    else create.mutate(payload, { onSuccess: done, onError: fail });
  }

  const deleteButton = project ? (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className={cn("h-11 px-4 text-sm sm:h-7 sm:px-2.5 sm:text-[0.8rem]", confirmDelete && "border-red-500 text-red-600")}
      disabled={busy}
      onClick={() => {
        if (!confirmDelete) return setConfirmDelete(true);
        del.mutate(project.id, {
          onSuccess: () => {
            toast.success("Project deleted");
            router.push("/targets?tab=projects");
          },
          onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't delete"),
        });
      }}
    >
      <Trash2 className="mr-1 size-3.5" />
      {confirmDelete ? "Tap again to delete" : "Delete"}
    </Button>
  ) : null;

  return (
    <FormShell backHref={backHref} backLabel={project ? "Project" : "Projects"} title={project ? "Edit Project" : "New Project"} submitLabel={project ? "Save Changes" : "Add Project"} busy={busy} onSubmit={save} extraActions={deleteButton}>
      <FormCard>
        <SectionHeading icon={FolderKanban} label="Project details" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldGroup label="Project name" required error={nameError} className="sm:col-span-2">
            <Input
              autoFocus={!project}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError("");
              }}
              placeholder="e.g. Wedding season stock"
              className="h-10"
              maxLength={120}
            />
          </FieldGroup>
          <FieldGroup label="Starts">
            <DatePicker value={start} onChange={setStart} placeholder="Start" className="w-full" />
          </FieldGroup>
          <FieldGroup label="Ends">
            <DatePicker value={end} onChange={setEnd} placeholder="End" className="w-full" />
          </FieldGroup>
          <FieldGroup label="Who runs it?">
            <Select value={owner} onValueChange={(v) => v && setOwner(v)}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue>{(v: unknown) => (v === NONE ? "Nobody yet" : staff.find((s) => s.id === v)?.name ?? "Choose")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nobody yet</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>
          <FieldGroup label="Status">
            <div className="flex flex-wrap gap-2">
              {PROJECT_STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)} className={pillClass(status === s)}>
                  {PROJECT_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </FieldGroup>
        </div>
      </FormCard>

      <FormCard>
        <SectionHeading icon={FileText} label="Details" />
        <FieldGroup label="What is this project about?">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Goal, scope, anything the team should know" className="resize-none" maxLength={2000} />
        </FieldGroup>
      </FormCard>
    </FormShell>
  );
}
