"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MiniSheet } from "@/lib/types";

const QUERY_KEY = ["mini-sheets"];

async function fetchSheets(): Promise<MiniSheet[]> {
  const res = await fetch("/api/sheets");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not load your sheets");
  return body.sheets as MiniSheet[];
}

/** The logged-in user's own mini spreadsheets — the desktop utility rail's Sheets icon. Several
 *  named sheets per account, saved server-side so they follow the user across devices. */
export function useMiniSheets() {
  const qc = useQueryClient();

  const query = useQuery({ queryKey: QUERY_KEY, queryFn: fetchSheets, staleTime: 30_000 });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not create sheet");
      return body.sheet as MiniSheet;
    },
    onSuccess: (sheet) => qc.setQueryData<MiniSheet[]>(QUERY_KEY, (old) => [sheet, ...(old || [])]),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; cells?: Record<string, unknown> }) => {
      const res = await fetch(`/api/sheets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save sheet");
      return body.sheet as MiniSheet;
    },
    onSuccess: (sheet) => qc.setQueryData<MiniSheet[]>(QUERY_KEY, (old) => (old || []).map((s) => (s.id === sheet.id ? sheet : s))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/sheets/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not delete sheet");
      return id;
    },
    onSuccess: (id) => qc.setQueryData<MiniSheet[]>(QUERY_KEY, (old) => (old || []).filter((s) => s.id !== id)),
  });

  return { ...query, create, update, remove };
}
