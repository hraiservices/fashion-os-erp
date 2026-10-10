"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/work-tasks";
import type { ProjectDto } from "@/lib/targets-types";
import { useCreateProject, useDeleteProject, usePatchProject, type TargetsMeta } from "@/hooks/use-targets";
import { cn } from "@/lib/utils";

const NONE = "none";

/** Add or edit a light project: name, owner, dates, status. % done comes from its tasks. */
export function ProjectFormSheet({
  open,
  onOpenChange,
  meta,
  project,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: TargetsMeta | undefined;
  project?: ProjectDto | null;
  onSaved?: () => void;
  onDeleted?: () => void;
}) {
  const create = useCreateProject();
  const patch = usePatchProject();
  const del = useDeleteProject();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState(NONE);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [status, setStatus] = useState("active");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const staff = (meta?.staff ?? []).filter((s) => s.active);
  const busy = create.isPending || patch.isPending || del.isPending;

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the sheet opens
    setConfirmDelete(false);
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setOwner(project ? project.ownerId ?? NONE : meta?.me.employeeId ?? NONE);
    setStart(project?.startDate ?? meta?.today ?? "");
    setEnd(project?.endDate ?? "");
    setStatus(project?.status ?? "active");
  }, [open, project, meta?.me.employeeId, meta?.today]);

  function save() {
    if (!name.trim()) return;
    const payload = { name: name.trim(), description: description.trim(), ownerId: owner === NONE ? null : owner, startDate: start || null, endDate: end || null, status };
    const done = () => {
      toast.success(project ? "Project saved" : "Project added");
      onOpenChange(false);
      onSaved?.();
    };
    const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't save the project");
    if (project) patch.mutate({ id: project.id, ...payload }, { onSuccess: done, onError: fail });
    else create.mutate(payload, { onSuccess: done, onError: fail });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{project ? "Edit project" : "New project"}</SheetTitle>
        </SheetHeader>
        <form
          className="space-y-4 px-4 pb-6"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-1.5">
            <Label className="text-sm">Project name</Label>
            <Input autoFocus={!project} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wedding season stock" className="h-12 text-base" maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Starts</Label>
              <DatePicker value={start} onChange={setStart} placeholder="Start" className="h-12 w-full" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Ends</Label>
              <DatePicker value={end} onChange={setEnd} placeholder="End" className="h-12 w-full" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Who runs it?</Label>
            <Select value={owner} onValueChange={(v) => v && setOwner(v)}>
              <SelectTrigger className="h-12 w-full">
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
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Status</Label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)} className={cn("min-h-11 rounded-full border px-4 text-sm font-medium", status === s ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card")}>
                  {PROJECT_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Details</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="text-base" maxLength={2000} />
          </div>
          <div className="flex gap-2 pt-1">
            {project && (
              <Button
                type="button"
                variant="outline"
                className={cn("h-12 shrink-0 px-4", confirmDelete && "border-red-500 text-red-600")}
                disabled={busy}
                onClick={() => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  del.mutate(project.id, {
                    onSuccess: () => {
                      toast.success("Project deleted");
                      onOpenChange(false);
                      onDeleted?.();
                    },
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't delete"),
                  });
                }}
              >
                {confirmDelete ? "Tap again to delete" : "Delete"}
              </Button>
            )}
            <Button type="submit" className="h-12 flex-1 text-base" disabled={busy || !name.trim()}>
              {busy ? "Saving…" : project ? "Save" : "Add project"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
