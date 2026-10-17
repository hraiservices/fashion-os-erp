"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAiOn, useTasksFromText, type TaskProposal } from "@/hooks/use-ai";
import { useCreateTask } from "@/hooks/use-targets";

type Row = TaskProposal & { keep: boolean };

/** Paste a chat or note (or dictate with the keyboard mic) and let AI pull out the to-dos. You review them before anything is created. */
export function TasksFromTextButton() {
  const on = useAiOn("tasks");
  const find = useTasksFromText();
  const create = useCreateTask();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  if (!on) return null;
  const reset = () => {
    setSource("");
    setRows(null);
  };
  const update = (i: number, patch: Partial<Row>) => setRows((r) => (r ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const chosen = (rows ?? []).filter((r) => r.keep && r.title.trim());

  async function createAll() {
    setSaving(true);
    let done = 0;
    for (const r of chosen) {
      try {
        await create.mutateAsync({ title: r.title.trim(), description: r.description, dueDate: r.dueDate });
        done += 1;
      } catch (e) {
        toast.error(`${r.title}: ${e instanceof Error ? e.message : "couldn't create"}`);
      }
    }
    setSaving(false);
    if (done) {
      toast.success(done === 1 ? "Task created" : `${done} tasks created`);
      setOpen(false);
      reset();
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(true)}>
        <Sparkles className="size-4 text-violet-600" /> Add from text
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tasks from text</DialogTitle>
            <DialogDescription>Paste a WhatsApp chat or notes, or tap your keyboard&apos;s mic and speak. AI lists the to-dos; you choose which to create.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-6">
            {!rows ? (
              <>
                <Textarea value={source} onChange={(e) => setSource(e.target.value)} rows={7} maxLength={4000} placeholder="e.g. Call Meera about the lehenga trial on Friday, ask tailor for Aarti's blouse by Monday…" className="text-base" />
                <Button type="button" className="h-12 w-full" disabled={source.trim().length < 5 || find.isPending} onClick={() => find.mutate(source, { onSuccess: (r) => setRows(r.tasks.map((t) => ({ ...t, keep: true }))), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't read that") })}>
                  {find.isPending && <Loader2 className="size-4 animate-spin" />} Find tasks
                </Button>
              </>
            ) : rows.length === 0 ? (
              <>
                <p className="text-sm text-muted-foreground">No to-dos found in that text.</p>
                <Button type="button" variant="outline" className="h-12 w-full" onClick={() => setRows(null)}>Back</Button>
              </>
            ) : (
              <>
                <ul className="space-y-2">
                  {rows.map((r, i) => (
                    <li key={i} className="space-y-1.5 rounded-lg border p-2.5">
                      <label className="flex items-start gap-2">
                        <input type="checkbox" checked={r.keep} onChange={(e) => update(i, { keep: e.target.checked })} className="mt-3 size-4 accent-primary" />
                        <Input value={r.title} onChange={(e) => update(i, { title: e.target.value })} maxLength={200} className="h-11" aria-label="Task title" />
                      </label>
                      <div className="pl-6">
                        <Input type="date" value={r.dueDate ?? ""} onChange={(e) => update(i, { dueDate: e.target.value || null })} className="h-11" aria-label="Due date" />
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setRows(null)}>Back</Button>
                  <Button type="button" className="h-12 flex-1" disabled={chosen.length === 0 || saving} onClick={createAll}>
                    {saving && <Loader2 className="size-4 animate-spin" />} Create {chosen.length}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
