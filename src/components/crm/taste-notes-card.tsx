"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAiOn, useSaveTasteNotes, useSuggestTasteNotes, useTasteNotes } from "@/hooks/use-ai";

/** What this customer likes — short notes staff keep (or AI suggests from her orders and chats, and staff approve one by one). */
export function TasteNotesCard({ mobile, readOnly = false }: { mobile: string; readOnly?: boolean }) {
  const { data } = useTasteNotes(mobile);
  const save = useSaveTasteNotes(mobile);
  const suggest = useSuggestTasteNotes(mobile);
  const aiOn = useAiOn("memory");
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  if (!data?.supported) return null;
  const notes = data.notes;
  if (readOnly && notes.length === 0) return null;

  const persist = (next: string[], done?: () => void) => save.mutate(next, { onSuccess: done, onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save") });

  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Style notes</h2>
        {!readOnly && aiOn && (
          <Button type="button" variant="outline" className="h-11" disabled={suggest.isPending} onClick={() => suggest.mutate(undefined, { onSuccess: (r) => (r.suggestions.length ? setSuggestions(r.suggestions) : toast.info("Nothing new to suggest yet")), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't get suggestions") })}>
            {suggest.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 text-violet-600" />} Suggest from history
          </Button>
        )}
      </div>
      {notes.length === 0 && suggestions.length === 0 && <p className="text-xs text-muted-foreground">No notes yet — add what you learn about her taste.</p>}
      <ul className="space-y-1">
        {notes.map((n) => (
          <li key={n} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
            <span className="min-w-0 flex-1">{n}</span>
            {!readOnly && (
              <button type="button" aria-label={`Remove note: ${n}`} onClick={() => persist(notes.filter((x) => x !== n))} className="inline-flex size-11 shrink-0 items-center justify-center text-muted-foreground">
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {suggestions.length > 0 && (
        <div className="space-y-1 rounded-lg border border-violet-200 bg-violet-50/60 p-2 dark:border-violet-500/30 dark:bg-violet-500/5">
          <p className="px-1 text-xs font-medium text-violet-700 dark:text-violet-300">AI suggestions — keep the ones that are right</p>
          {suggestions.map((s) => (
            <div key={s} className="flex items-center gap-2 rounded-md bg-card px-3 py-1 text-sm">
              <span className="min-w-0 flex-1">{s}</span>
              <button type="button" aria-label={`Keep: ${s}`} onClick={() => persist([...notes, s], () => setSuggestions((x) => x.filter((y) => y !== s)))} className="inline-flex size-11 shrink-0 items-center justify-center text-emerald-600">
                <Check className="size-4" />
              </button>
              <button type="button" aria-label={`Dismiss: ${s}`} onClick={() => setSuggestions((x) => x.filter((y) => y !== s))} className="inline-flex size-11 shrink-0 items-center justify-center text-muted-foreground">
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = draft.trim();
            if (v) persist([...notes, v], () => setDraft(""));
          }}
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a note, e.g. prefers pastel colours" maxLength={150} className="h-11" />
          <Button type="submit" variant="outline" className="h-11 shrink-0" disabled={!draft.trim() || save.isPending} aria-label="Add note">
            <Plus className="size-4" />
          </Button>
        </form>
      )}
    </section>
  );
}
