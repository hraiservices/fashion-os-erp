"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, ChevronDown, User } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useChatbotHistory, useAskChatbot } from "@/hooks/use-chatbot";
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
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} /> {open ? "Hide" : "Show"} query
      </button>
      {open && <pre className="mt-1.5 overflow-x-auto rounded-md bg-muted/60 p-2.5 text-[11px] leading-relaxed">{sql}</pre>}
    </div>
  );
}

export default function CopilotPage() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { data: history, isLoading: historyLoading } = useChatbotHistory();
  const ask = useAskChatbot();
  const [question, setQuestion] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
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
    try {
      await ask.mutateAsync(q);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  if (userLoading) return <div className="p-4 sm:p-6"><Skeleton className="h-96 w-full" /></div>;

  if (!canUse) {
    return (
      <div className="p-6">
        <EmptyState icon={Sparkles} title="AI Copilot isn't available for your account" description="Ask an admin to grant AI Copilot access from Settings → Users & Roles." />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-3xl flex-col p-4 sm:p-6 lg:h-dvh">
      <PageHeader title="AI Copilot" description="Ask about revenue, orders, deliveries, or payments — in English or Hindi." />

      <div className="mt-4 flex-1 space-y-4 overflow-y-auto rounded-xl border bg-card p-4">
        {historyLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !history?.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-6" />
            </span>
            <div>
              <p className="text-sm font-medium">Ask me anything about the shop</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Try one of these, or type your own question below.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSend(s)}
                  className="rounded-full border bg-muted/40 px-3 py-1.5 text-xs hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          history.map((m) => (
            <div key={m.id} className="space-y-3">
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
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2 text-sm">
                  <p className="whitespace-pre-wrap">{m.answer}</p>
                  {m.generated_sql && <SqlDisclosure sql={m.generated_sql} />}
                  <p className="mt-1.5 text-[11px] text-muted-foreground">{fmtDate(m.created_at)}</p>
                </div>
              </div>
            </div>
          ))
        )}

        {ask.isPending && (
          <div className="flex gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-3.5" />
            </span>
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2.5">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}

        {localError && <p className="text-center text-xs text-destructive">{localError}</p>}
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
