"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StickyNote, X, Plus, Search, MoreVertical, Trash2, Check } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useQuickNotes, useCreateQuickNote, useUpdateQuickNote, useDeleteQuickNote, NOTE_COLORS, type NoteColor, type QuickNote } from "@/hooks/use-quick-notes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const COLOR_CLASSES: Record<NoteColor, string> = {
  green: "bg-emerald-100 dark:bg-emerald-950/60",
  teal: "bg-teal-100 dark:bg-teal-950/60",
  yellow: "bg-amber-100 dark:bg-amber-950/60",
  pink: "bg-pink-100 dark:bg-pink-950/60",
  blue: "bg-sky-100 dark:bg-sky-950/60",
  orange: "bg-orange-100 dark:bg-orange-950/60",
};

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function nextColor(notes: QuickNote[]): NoteColor {
  return NOTE_COLORS[notes.length % NOTE_COLORS.length];
}

/**
 * Zoho Notebook-style quick notes panel — content only, no launcher of its own. Rendered by
 * RightSidebar (right-sidebar.tsx) when the "notes" rail item is active, so this component
 * doesn't own its own open/close state or fixed positioning.
 */
export function QuickNotesPanel({ onClose }: { onClose: () => void }) {
  const { data: user } = useCurrentUser();
  const { data: notes } = useQuickNotes(user?.email);
  const createNote = useCreateQuickNote();
  const updateNote = useUpdateQuickNote();
  const deleteNote = useDeleteQuickNote();

  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const filtered = useMemo(() => {
    const list = notes || [];
    const q = search.trim().toLowerCase();
    return q ? list.filter((n) => n.content.toLowerCase().includes(q)) : list;
  }, [notes, search]);

  if (!user?.email) return null;

  async function handleCreate() {
    if (!draft.trim()) { setComposing(false); return; }
    try {
      await createNote.mutateAsync({ userEmail: user!.email, content: draft.trim(), color: nextColor(notes || []) });
      setDraft("");
      setComposing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save note");
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editDraft.trim()) { setEditingId(null); return; }
    try {
      await updateNote.mutateAsync({ id, content: editDraft.trim(), userEmail: user!.email });
      setEditingId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update note");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteNote.mutateAsync({ id, userEmail: user!.email });
      toast.success("Note deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete note");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <StickyNote className="size-4 text-muted-foreground" /> Notes
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close notes">
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search notes…" className="h-8 pl-8 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setComposing(true)} aria-label="Add note">
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {composing && (
          <div className={cn("space-y-2 rounded-lg p-3", COLOR_CLASSES[nextColor(notes || [])])}>
            <Textarea
              autoFocus
              rows={3}
              placeholder="Type a note…"
              className="border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setComposing(false); setDraft(""); }
              }}
            />
            <div className="flex justify-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => { setComposing(false); setDraft(""); }}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={createNote.isPending}>
                <Check className="size-3.5" /> Save
              </Button>
            </div>
          </div>
        )}

        {filtered.length === 0 && !composing ? (
          <p className="px-1 py-8 text-center text-xs text-muted-foreground">
            {search ? "No notes match your search." : "No notes yet — click + to add one."}
          </p>
        ) : (
          filtered.map((note) => (
            <div key={note.id} className={cn("group relative rounded-lg p-3", COLOR_CLASSES[note.color])}>
              {editingId === note.id ? (
                <div className="space-y-2">
                  <Textarea
                    autoFocus
                    rows={3}
                    className="border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => handleSaveEdit(note.id)} disabled={updateNote.isPending}>
                      <Check className="size-3.5" /> Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="block w-full pr-6 text-left text-sm whitespace-pre-wrap break-words text-foreground/90"
                    onClick={() => { setEditingId(note.id); setEditDraft(note.content); }}
                  >
                    {note.content}
                  </button>
                  <p className="mt-1.5 text-[11px] text-foreground/50">{relativeDate(note.createdAt)}</p>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button type="button" aria-label="Note actions" className="absolute right-2 top-2 rounded p-0.5 text-foreground/40 opacity-0 hover:bg-black/5 group-hover:opacity-100">
                          <MoreVertical className="size-3.5" />
                        </button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem variant="destructive" onClick={() => handleDelete(note.id)}>
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
