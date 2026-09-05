"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

async function fetchNote(): Promise<string> {
  const res = await fetch("/api/notes");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not load your note");
  return body.note as string;
}

/** The logged-in user's own scratchpad note — the desktop utility rail's Notes icon. One note
 *  per account, saved server-side so it follows the user across devices/browsers. */
export function useScratchpadNote() {
  const qc = useQueryClient();

  const query = useQuery({ queryKey: ["scratchpad-note"], queryFn: fetchNote, staleTime: 60_000 });

  const save = useMutation({
    mutationFn: async (note: string) => {
      const res = await fetch("/api/notes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save your note");
      return note;
    },
    onSuccess: (note) => qc.setQueryData(["scratchpad-note"], note),
  });

  return { ...query, save };
}
