"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export const NOTE_COLORS = ["green", "teal", "yellow", "pink", "blue", "orange"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface QuickNote {
  id: string;
  content: string;
  color: NoteColor;
  createdAt: string;
  updatedAt: string;
}

/** Scoped to the current user by user_email — a shop-wide table, filtered client-side like
 *  most data in this app, so each person only ever sees their own notes. */
export function useQuickNotes(userEmail: string | undefined) {
  return useQuery({
    queryKey: ["quick-notes", userEmail],
    queryFn: async (): Promise<QuickNote[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.from("quick_notes").select("*").eq("user_email", userEmail!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        content: r.content || "",
        color: (r.color as NoteColor) || "green",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    },
    enabled: !!userEmail,
    staleTime: 30_000,
  });
}

export function useCreateQuickNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userEmail, content, color }: { userEmail: string; content: string; color: NoteColor }) => {
      const supabase = createClient();
      const { error } = await supabase.from("quick_notes").insert({ user_email: userEmail, content, color });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["quick-notes", vars.userEmail] }),
  });
}

export function useUpdateQuickNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content, userEmail }: { id: string; content: string; userEmail: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("quick_notes").update({ content, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["quick-notes", vars.userEmail] }),
  });
}

export function useDeleteQuickNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; userEmail: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("quick_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["quick-notes", vars.userEmail] }),
  });
}
