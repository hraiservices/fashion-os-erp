"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { useAppSetting } from "@/hooks/use-app-setting";
import { DEFAULT_GLOSSARY, type GlossaryEntry } from "@/lib/chatbot/glossary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Lets an admin teach the AI Copilot the shop's own vocabulary without a code change —
 * every entry here is appended to the system prompt on every question. See lib/chatbot/gemini.ts.
 */
export function ChatbotGlossarySection() {
  const { data: glossary, isLoading, save } = useAppSetting<GlossaryEntry[]>("chatbotGlossary", DEFAULT_GLOSSARY);
  const [term, setTerm] = useState("");
  const [meaning, setMeaning] = useState("");

  const current = glossary || DEFAULT_GLOSSARY;

  async function addEntry() {
    const t = term.trim();
    const m = meaning.trim();
    if (!t || !m) return;
    if (current.some((g) => g.term.toLowerCase() === t.toLowerCase())) {
      toast.error("That term already has a clarification — remove it first if you want to replace it");
      return;
    }
    try {
      await save.mutateAsync([...current, { term: t, meaning: m }]);
      setTerm("");
      setMeaning("");
      toast.success("Clarification added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function removeEntry(t: string) {
    try {
      await save.mutateAsync(current.filter((g) => g.term !== t));
      toast.success("Removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 w-full lg:col-span-2" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Business vocabulary</CardTitle>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{current.length}</span>
          </div>
        </CardHeader>
        <CardContent>
          {current.length === 0 ? (
            <EmptyState icon={Sparkles} title="No clarifications yet" description="Add one from the panel on the right whenever the Copilot misreads a term." />
          ) : (
            <ul className="space-y-2.5">
              {current.map((g) => (
                <li key={g.term} className="rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{g.term}</p>
                    <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => removeEntry(g.term)} aria-label={`Remove ${g.term}`} disabled={save.isPending}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{g.meaning}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Add a clarification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Term or phrase</Label>
              <Input placeholder="e.g. VIP customer" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">What it actually means</Label>
              <Textarea
                rows={3}
                placeholder="e.g. A customer with lifetime spend over ₹50,000 — there's no column for this, so treat it as SUM(total) per customer_mobile > 50000."
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={addEntry} disabled={save.isPending || !term.trim() || !meaning.trim()}>
              <Plus className="size-4" /> Add clarification
            </Button>
            <p className="text-xs text-muted-foreground">Takes effect on the very next question — no restart needed.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
