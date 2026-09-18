"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Note, NoteColor } from "@/lib/types";

const QUERY_KEY = ["scratch-notes"];

async function fetchNotes(): Promise<Note[]> {
  const res = await fetch("/api/notes");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not load your notes");
  return body.notes as Note[];
}

/** The logged-in user's own sticky notes — the desktop utility rail's Notes icon. Several
 *  notes per account, each independently colored, saved server-side so they follow the user
 *  across devices/browsers. */
export function useNotes() {
  const qc = useQueryClient();

  const query = useQuery({ queryKey: QUERY_KEY, queryFn: fetchNotes, staleTime: 30_000 });

  const create = useMutation({
    mutationFn: async (color: NoteColor) => {
      const res = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color, content: "" }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not create note");
      return body.note as Note;
    },
    onSuccess: (note) => qc.setQueryData<Note[]>(QUERY_KEY, (old) => [note, ...(old || [])]),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; content?: string; color?: NoteColor }) => {
      const res = await fetch(`/api/notes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save note");
      return body.note as Note;
    },
    onSuccess: (note) => qc.setQueryData<Note[]>(QUERY_KEY, (old) => (old || []).map((n) => (n.id === note.id ? note : n))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not delete note");
      return id;
    },
    onSuccess: (id) => qc.setQueryData<Note[]>(QUERY_KEY, (old) => (old || []).filter((n) => n.id !== id)),
  });

  return { ...query, create, update, remove };
}
