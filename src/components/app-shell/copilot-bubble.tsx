"use client";

import { useRef, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles, Send, X, Copy, Check, Mic, MicOff, RotateCcw, Eraser } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { isModuleEnabled, DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { useChatbotHistory, useAskChatbot, useClearChatbotHistory } from "@/hooks/use-chatbot";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useCopilotOpen } from "@/components/app-shell/copilot-context";
import { hapticTap } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Also used by MobileTabBar to build the same support link for its "Support" tab. */
export const WA_SUPPORT = "919897504343";

export function buildSupportWhatsAppHref(shopName?: string): string {
  const text = encodeURIComponent(`Hi, I need support with ${shopName || "Fashion Flow"}`);
  return `https://wa.me/${WA_SUPPORT}?text=${text}`;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("fill-current", className)} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
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

/** Copy / share-to-WhatsApp actions under a bot answer — the same quick actions a native
 *  assistant offers on any text it hands you, rather than leaving you to manually select it. */
function MessageActions({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 flex items-center gap-3 pl-7">
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          hapticTap();
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <WhatsAppIcon className="size-3" /> Share
      </a>
    </div>
  );
}

export function CopilotBubble() {
  const { data: user } = useCurrentUser();
  const { data: shop } = useShopSettings();
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

  const waHref = buildSupportWhatsAppHref(shop?.name);

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
          <div className="flex flex-col items-center gap-3 pt-4 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="size-5 text-primary" />
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
                  className="rounded-full border bg-muted/40 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted"
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
            <div key={m.id} className="space-y-2">
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
                  <MessageActions text={m.answer} />
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
          <div className="flex gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-3" />
            </span>
            <div className="flex items-center gap-1 rounded-xl rounded-tl-sm bg-muted/60 px-3 py-2.5">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}

        {localError && (
          <div className="text-center">
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
        <div className="mb-2 flex h-[440px] w-[350px] flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10">
          <div className="flex shrink-0 items-center gap-2 border-b bg-primary px-3 py-2.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary-foreground/20">
              <Sparkles className="size-3.5 text-primary-foreground" />
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
            <div className="flex shrink-0 items-center gap-2 border-b bg-primary px-4 py-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary-foreground/20">
                <Sparkles className="size-4 text-primary-foreground" />
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

      {/* ── FAB buttons — desktop only; on mobile these live in the bottom tab bar instead
          (MobileTabBar), so the floating circles don't sit on top of page content. ── */}
      <div className="hidden flex-col items-end gap-2 lg:flex">
        {/* WhatsApp support */}
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp support"
          className="flex size-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <WhatsAppIcon className="size-[22px]" />
        </a>

        {/* AI Copilot toggle */}
        {canUse && (
          <button
            type="button"
            onClick={() => {
              hapticTap();
              setOpen((o) => !o);
            }}
            aria-label={open ? "Close AI Copilot" : "Open AI Copilot"}
            className={cn(
              "flex size-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95",
              open ? "bg-primary text-primary-foreground ring-2 ring-primary/30" : "border bg-background text-primary hover:bg-primary/5"
            )}
          >
            {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
          </button>
        )}
      </div>
    </div>
  );
}
