"use client";

import { useRef, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles, Send, X, Mic, MicOff, RotateCcw, Eraser } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isModuleEnabled, DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { useChatbotHistory, useAskChatbot, useClearChatbotHistory } from "@/hooks/use-chatbot";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useCopilotOpen } from "@/components/app-shell/copilot-context";
import { hapticTap } from "@/lib/haptics";
import { fmtTime } from "@/lib/format";
import { MessageActions } from "@/components/chatbot/message-actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/** Also used by MobileTabBar to build the same support link for its "Support" tab. */
export const WA_SUPPORT = "919897504343";

export function buildSupportWhatsAppHref(shopName?: string): string {
  const text = encodeURIComponent(`Hi, I need support with ${shopName || "Fashion Flow"}`);
  return `https://wa.me/${WA_SUPPORT}?text=${text}`;
}

const QUICK_QUESTIONS = [
  "Aaj pending orders kya hain?",
  "Overdue orders dikhao",
  "Is mahine ka revenue kitna hai?",
  "Aaj delivery waale orders?",
];

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function useMicSupport(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window),
    () => false
  );
}

export function CopilotBubble() {
  const { data: user } = useCurrentUser();
  const { data: entitlements } = useModuleEntitlements();
  const { data: history } = useChatbotHistory();
  const ask = useAskChatbot();
  const clearHistory = useClearChatbotHistory();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const micSupported = useMicSupport();

  const { open, setOpen } = useCopilotOpen();
  const [question, setQuestion] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [lastRefs, setLastRefs] = useState<{ id: string; label: string }[]>([]);
  const [lastRefTable, setLastRefTable] = useState<"orders" | "invoices" | null>(null);
  const [lastFollowups, setLastFollowups] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const canUse = !!user?.perms.useChatbot && isModuleEnabled(entitlements ?? DEFAULT_ENTITLEMENTS, "copilot");

  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, ask.isPending, open]);

  async function send(text?: string) {
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
    hapticTap();
    clearHistory.mutate();
    setLastRefs([]);
    setLastRefTable(null);
    setLastFollowups([]);
    setLocalError(null);
    setLastFailedQuestion(null);
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setQuestion((q) => (q ? `${q} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    hapticTap();
    recognition.start();
    setListening(true);
  }

  const refHref = (id: string) => (lastRefTable === "invoices" ? `/sales/invoices/${id}` : `/orders/${id}`);

  const body: ReactNode = (
    <>
      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {!history?.length && !ask.isPending && (
          <div className="flex animate-in flex-col items-center gap-3 pt-4 text-center fade-in slide-in-from-bottom-2 duration-500">
            <span className="relative flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5">
              <span className="absolute inset-0 animate-ai-core-pulse rounded-full bg-primary/10" />
              <Sparkles className="relative size-5 text-primary" />
            </span>
            <div>
              <p className="text-sm font-semibold">Company ke baare mein kuch bhi poocho</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Revenue, orders, overdue — sab kuch</p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="rounded-full border bg-muted/40 px-2.5 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {history?.map((m, i) => {
          const isLast = i === history.length - 1;
          return (
            <div key={m.id} className="animate-in space-y-2 fade-in slide-in-from-bottom-1 duration-300">
              <div className="flex justify-end">
                <div className="max-w-[82%] rounded-xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{m.question}</div>
              </div>
              <div className="flex gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="inline-block max-w-full rounded-xl rounded-tl-sm bg-muted/60 px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap leading-relaxed">{m.answer}</p>
                  </div>
                  <MessageActions text={m.answer} timestamp={fmtTime(m.created_at)} />
                  {isLast && lastRefs.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 pl-7">
                      {lastRefs.map((r) => (
                        <Link
                          key={r.id}
                          href={refHref(r.id)}
                          onClick={() => setOpen(false)}
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
                          onClick={() => send(f)}
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
        })}

        {ask.isPending && (
          <div className="flex animate-in gap-2 fade-in slide-in-from-bottom-1 duration-300">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-3 animate-pulse" />
            </span>
            <div className="flex items-center gap-1 rounded-xl rounded-tl-sm bg-muted/60 px-3 py-2.5">
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
                onClick={() => send(lastFailedQuestion)}
                className="mt-1.5 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="size-3" /> Retry
              </button>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t bg-muted/30 p-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Kuch bhi poocho…"
            rows={1}
            className="min-h-11 max-h-24 flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          {micSupported && (
            <Button
              type="button"
              variant={listening ? "default" : "outline"}
              size="icon"
              className="size-11 shrink-0"
              onClick={toggleListening}
              aria-label={listening ? "Stop voice input" : "Ask by voice"}
            >
              {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
          )}
          <Button type="submit" size="icon" className="size-11 shrink-0" disabled={!question.trim() || ask.isPending} aria-label="Send">
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </>
  );

  return (
    // bottom-20 is a guess at the mobile tab bar's height — unlike the tab bar itself
    // (mobile-nav.tsx's pb-[env(safe-area-inset-bottom)]), this never accounted for the bottom
    // safe-area inset, so on a phone with a tall gesture-nav area the FAB stack could sit too
    // close to (or overlapping) the tab bar/page content instead of clearing it. calc() layers
    // the inset on top of the fixed guess rather than replacing it, so this only pushes the
    // stack up further on devices that actually have a non-zero inset.
    <div
      className="fixed right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-end gap-2 lg:right-6 lg:bottom-8 print:hidden"
    >
      {/* Desktop: small floating panel */}
      {isDesktop && open && canUse && (
        <div className="mb-2 flex h-[440px] w-[350px] animate-in flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10 fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
          <div className="flex shrink-0 items-center gap-2 bg-gradient-to-r from-primary to-primary/85 px-3 py-2.5">
            <span className="relative flex size-6 items-center justify-center rounded-full bg-primary-foreground/20">
              <span className="absolute inset-0 animate-ai-core-pulse rounded-full bg-primary-foreground/20" />
              <Sparkles className="relative size-3.5 text-primary-foreground" />
            </span>
            <span className="flex-1 text-sm font-semibold text-primary-foreground">AI Copilot</span>
            {!!history?.length && (
              <button
                type="button"
                onClick={clearChat}
                disabled={clearHistory.isPending}
                className="rounded p-0.5 text-primary-foreground/70 transition-colors hover:text-primary-foreground"
                aria-label="Start a new chat"
                title="Start a new chat"
              >
                <Eraser className="size-4" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 text-primary-foreground/70 transition-colors hover:text-primary-foreground" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          {body}
        </div>
      )}

      {/* Mobile: full-width bottom sheet, matching the rest of the app's mobile overlay pattern */}
      {!isDesktop && (
        <Sheet open={open && canUse} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="flex h-[85dvh] flex-col gap-0 rounded-t-2xl p-0">
            <SheetTitle className="sr-only">AI Copilot</SheetTitle>
            <div className="flex shrink-0 items-center gap-2 bg-gradient-to-r from-primary to-primary/85 px-4 py-3">
              <span className="relative flex size-7 items-center justify-center rounded-full bg-primary-foreground/20">
                <span className="absolute inset-0 animate-ai-core-pulse rounded-full bg-primary-foreground/20" />
                <Sparkles className="relative size-4 text-primary-foreground" />
              </span>
              <span className="flex-1 text-base font-semibold text-primary-foreground">AI Copilot</span>
              {!!history?.length && (
                <button
                  type="button"
                  onClick={clearChat}
                  disabled={clearHistory.isPending}
                  className="rounded p-1 text-primary-foreground/70 transition-colors hover:text-primary-foreground"
                  aria-label="Start a new chat"
                  title="Start a new chat"
                >
                  <Eraser className="size-5" />
                </button>
              )}
            </div>
            {body}
          </SheetContent>
        </Sheet>
      )}

    </div>
  );
}
