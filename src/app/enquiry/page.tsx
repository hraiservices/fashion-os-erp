"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

/** Public enquiry form — opened from the QR code on the counter, an Instagram bio or a WhatsApp status. Needs no login. */
function EnquiryForm() {
  const params = useSearchParams();
  const source = (params.get("src") || "Website").slice(0, 40);
  const [shop, setShop] = useState("");
  const [form, setForm] = useState({ name: "", mobile: "", looking: "", neededBy: "", message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/public/enquiry")
      .then((r) => r.json())
      .then((d) => setShop(d.shopName || ""))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("sending");
    const res = await fetch("/api/public/enquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, neededBy: form.neededBy || null, source }) }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    if (res?.ok) setState("done");
    else {
      setState("idle");
      setError(body?.error || "Something went wrong — please try again.");
    }
  }

  const field = "h-12 w-full rounded-lg border bg-background px-3 text-base";
  if (state === "done") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <CheckCircle2 className="size-14 text-emerald-600" />
        <h1 className="text-2xl font-semibold">Thank you!</h1>
        <p className="text-muted-foreground">We have your enquiry{shop ? ` at ${shop}` : ""} and will get back to you very soon.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mx-auto min-h-dvh max-w-md space-y-4 px-4 py-8">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">{shop || "Enquiry"}</h1>
        <p className="text-sm text-muted-foreground">Tell us what you&apos;re looking for and we&apos;ll get back to you.</p>
      </div>
      <label className="block space-y-1 text-sm font-medium">
        Your name
        <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} autoComplete="name" />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        Mobile number
        <input className={field} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required inputMode="tel" autoComplete="tel" maxLength={20} />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        What are you looking for?
        <input className={field} value={form.looking} onChange={(e) => setForm({ ...form, looking: e.target.value })} placeholder="e.g. Bridal lehenga, blouse, kurta set" maxLength={200} />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        When do you need it? <span className="font-normal text-muted-foreground">(optional)</span>
        <input type="date" className={field} value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        Anything else? <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea className="w-full rounded-lg border bg-background px-3 py-2 text-base" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={600} />
      </label>
      {/* Honeypot — hidden from people, tempting to bots. */}
      <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} name="website" />
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={state === "sending"} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-medium text-primary-foreground disabled:opacity-60">
        {state === "sending" && <Loader2 className="size-4 animate-spin" />} Send enquiry
      </button>
    </form>
  );
}

export default function EnquiryPage() {
  return (
    <Suspense fallback={null}>
      <EnquiryForm />
    </Suspense>
  );
}
