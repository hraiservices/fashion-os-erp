"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Send, ChevronDown, User, Eraser } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useChatbotHistory, useAskChatbot, useClearChatbotHistory } from "@/hooks/use-chatbot";
import { MessageActions } from "@/components/chatbot/message-actions";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

const SUGGESTIONS = ["Aaj ka pending kaam kya hai?", "Kis tailor ke paas sabse zyada orders hain?", "Kaun se orders overdue hain?", "This month's revenue kitna hai?"];

function SqlDisclosure({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} /> {open ? "Hide" : "Show"} tools used
      </button>
      {open && <pre className="mt-1.5 overflow-x-auto rounded-md bg-muted/60 p-2.5 text-[11px] leading-relaxed">{sql}</pre>}
    </div>
  );
}

export default function CopilotPage() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: history, isLoading: historyLoading } = useChatbotHistory();
  const ask = useAskChatbot();
  const clearHistory = useClearChatbotHistory();
  const [question, setQuestion] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const [lastRefs, setLastRefs] = useState<{ id: string; label: string }[]>([]);
  const [lastRefTable, setLastRefTable] = useState<"orders" | "invoices" | null>(null);
  const [lastFollowups, setLastFollowups] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const canUse = !!user?.perms.useChatbot;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, ask.isPending]);

  async function handleSend(text?: string) {
    const q = (text ?? question).trim();
    if (!q || ask.isPending) return;
    setQuestion("");
    setLocalError(null);
    setLastFailedQuestion(null);
    try {
      const res = await ask.mutateAsync(q);
      setLastRefs(res.refs);
      setLastRefTable(res.refTable);
      setLastFollowups(res.followups);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Something went wrong");
      setLastFailedQuestion(q);
    }
  }

  function clearChat() {
    clearHistory.mutate();
    setLastRefs([]);
    setLastRefTable(null);
    setLastFollowups([]);
    setLocalError(null);
    setLastFailedQuestion(null);
  }

  const refHref = (id: string) => (lastRefTable === "invoices" ? `/sales/invoices/${id}` : `/orders/${id}`);

  if (userLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  if (!canUse) {
    return (
      <div className="p-6">
        <EmptyState icon={Sparkles} title="AI Copilot isn't available for your account" description="Ask an admin to grant AI Copilot access from Settings → Users & Roles." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] h-[calc(100dvh-4rem)] max-w-3xl flex-col p-4 sm:p-6 lg:h-screen lg:h-dvh">
      <PageHeader
        title="AI Copilot"
        description="Ask about revenue, orders, deliveries, or payments — in English or Hindi."
        actions={
          !!history?.length && (
            <Button variant="outline" size="sm" onClick={clearChat} disabled={clearHistory.isPending} className="gap-1.5">
              <Eraser className="size-3.5" /> Clear chat
            </Button>
          )
        }
      />

      <div className="mt-4 flex-1 space-y-4 overflow-y-auto rounded-xl border bg-gradient-to-b from-card to-muted/10 p-4 shadow-sm">
        {historyLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !history?.length ? (
          <div className="flex h-full animate-in flex-col items-center justify-center gap-4 py-10 text-center fade-in slide-in-from-bottom-2 duration-500">
            <span className="relative flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5">
              <span className="absolute inset-0 animate-ai-core-pulse rounded-full bg-primary/10" />
              <Sparkles className="relative size-7 text-primary" />
            </span>
            <div>
              <p className="text-sm font-medium">Ask me anything about the company</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Try one of these, or type your own question below.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSend(s)}
                  className="rounded-full border bg-muted/40 px-3 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          history.map((m, i) => {
            const isLast = i === history.length - 1;
            return (
              <div key={m.id} className="animate-in space-y-3 fade-in slide-in-from-bottom-1 duration-300">
                <div className="flex justify-end gap-2">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">{m.question}</div>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <User className="size-3.5" />
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="size-3.5" />
                  </span>
                  <div className="min-w-0 max-w-[85%] flex-1">
                    <div className="inline-block max-w-full rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2 text-sm">
                      <p className="whitespace-pre-wrap">{m.answer}</p>
                      {m.generated_sql && <SqlDisclosure sql={m.generated_sql} />}
                    </div>
                    <MessageActions text={m.answer} timestamp={fmtDate(m.created_at)} />
                    {isLast && lastRefs.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 pl-7">
                        {lastRefs.map((r) => (
                          <Link
                            key={r.id}
                            href={refHref(r.id)}
                            className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted"
                          >
                            {r.label}
                          </Link>
                        ))}
                      </div>
                    )}
                    {isLast && lastFollowups.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 pl-7">
                        {lastFollowups.map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => handleSend(f)}
                            className="rounded-full border border-dashed bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {ask.isPending && (
          <div className="flex animate-in gap-2 fade-in slide-in-from-bottom-1 duration-300">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-3.5 animate-pulse" />
            </span>
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2.5">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}

        {localError && (
          <div className="animate-in text-center fade-in slide-in-from-bottom-1 duration-300">
            <p className="text-xs text-destructive">{localError}</p>
            {lastFailedQuestion && (
              <button
                type="button"
                onClick={() => handleSend(lastFailedQuestion)}
                className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Retry
              </button>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="mt-3 flex items-end gap-2"
      >
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Aaj kitna revenue hua? Overdue orders dikhao..."
          rows={1}
          className="max-h-32 min-h-11 flex-1 resize-none"
        />
        <Button type="submit" disabled={!question.trim() || ask.isPending} size="icon" aria-label="Send">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
