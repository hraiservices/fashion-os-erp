"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";

interface Turn {
  q: string;
  a: string;
}

/** A small "ask us a question" helper on the customer's tracking page. Only shown when the shop has switched the chat on. */
export function TrackChat({ token, shopPhone }: { token: string; shopPhone: string }) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/public/track-chat?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setAvailable(!!d.available))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns, busy]);

  if (!available) return null;

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/public/track-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, question, history: turns.slice(-3) }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok && body?.answer) {
      setTurns((t) => [...t, { q: question, a: body.answer }]);
      setQ("");
    } else {
      setError(body?.error || "Something went wrong — please call us.");
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium">
        <MessageCircle className="size-4 text-primary" /> Have a question? Ask us here
      </button>
    );
  }
  return (
    <section className="space-y-3 rounded-xl border bg-card p-3" aria-label="Ask a question">
      <p className="text-sm font-semibold">Ask about your order</p>
      <div className="max-h-72 space-y-2 overflow-y-auto text-sm">
        {turns.length === 0 && <p className="text-xs text-muted-foreground">For example: &quot;When will my blouse be ready?&quot; or &quot;How much balance is left?&quot;</p>}
        {turns.map((t, i) => (
          <div key={i} className="space-y-1">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-primary-foreground">{t.q}</p>
            <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3 py-1.5">{t.a}</p>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Looking that up…
          </p>
        )}
        <div ref={endRef} />
      </div>
      {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      <form onSubmit={ask} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="Type your question" className="h-12 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base" aria-label="Your question" />
        <button type="submit" disabled={busy || !q.trim()} className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50" aria-label="Send">
          <Send className="size-4" />
        </button>
      </form>
      <p className="text-[11px] text-muted-foreground">This is an automatic helper. For changes or anything else{shopPhone ? `, please call ${shopPhone}` : ", please contact the shop"}.</p>
    </section>
  );
}
