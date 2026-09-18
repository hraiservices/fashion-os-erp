"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Todo } from "@/lib/types";

const QUERY_KEY = ["todos"];

async function fetchTodos(): Promise<Todo[]> {
  const res = await fetch("/api/todos");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not load your to-dos");
  return body.todos as Todo[];
}

/** The logged-in user's own to-do list — the desktop utility rail's To-do icon. */
export function useTodos() {
  const qc = useQueryClient();

  const query = useQuery({ queryKey: QUERY_KEY, queryFn: fetchTodos, staleTime: 30_000 });

  const create = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not create to-do");
      return body.todo as Todo;
    },
    onSuccess: (todo) => qc.setQueryData<Todo[]>(QUERY_KEY, (old) => [todo, ...(old || [])]),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; text?: string; done?: boolean }) => {
      const res = await fetch(`/api/todos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save to-do");
      return body.todo as Todo;
    },
    onSuccess: (todo) => qc.setQueryData<Todo[]>(QUERY_KEY, (old) => (old || []).map((t) => (t.id === todo.id ? todo : t))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not delete to-do");
      return id;
    },
    onSuccess: (id) => qc.setQueryData<Todo[]>(QUERY_KEY, (old) => (old || []).filter((t) => t.id !== id)),
  });

  return { ...query, create, update, remove };
}
