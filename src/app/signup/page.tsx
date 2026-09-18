"use client";

import { useState } from "react";
import { Store, User, Mail, Phone, MessageSquare, Loader2, CheckCircle2, AlertCircle, Scissors, PlayCircle, ArrowLeft, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isValidEmail } from "@/lib/auth-errors";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// A separate, always-on demo deployment seeded with sample data — never this shop's own real
// account, since that would hand out real customer/order data to any stranger who fills this
// form. Falls back to the shop's actual demo instance if the env vars aren't set on this
// deployment, so the card still works out of the box.
const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_URL || "https://demo.fashionflow.app/login";
const DEMO_USER = process.env.NEXT_PUBLIC_DEMO_USER || "9897504343";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "2026";
const MARKETING_SITE_URL = process.env.NEXT_PUBLIC_MARKETING_SITE_URL || "https://fashionflow.app";

/** Icon-prefixed labeled field, matching /login's IconField but local to this page — this is a
 *  public lead-capture form (see submit_signup_request in add_signup_requests.sql), NOT account
 *  creation. Each new shop gets its own fully separate deployment, provisioned by the platform
 *  owner from the request this submits — see docs/customer-onboarding.md. */
function Field({
  icon: Icon,
  label,
  ...inputProps
}: { icon: typeof Mail; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-bold text-muted-foreground">{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input {...inputProps} className="h-11 rounded-xl pl-10" />
      </div>
    </div>
  );
}

export default function SignupRequestPage() {
  const { data: shop } = useShopSettings();
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    setErr("");
    if (!name.trim()) return setErr("Enter your name.");
    if (!shopName.trim()) return setErr("Enter your shop's name.");
    if (!email.trim() || !isValidEmail(email)) return setErr("Enter a valid email address.");

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("submit_signup_request", {
      p_name: name.trim(),
      p_shop_name: shopName.trim(),
      p_email: email.trim().toLowerCase(),
      p_phone: phone.trim() || null,
      p_note: note.trim() || null,
    });
    setLoading(false);
    if (error) return setErr(error.message || "Something went wrong — please try again.");
    setDone(true);
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 p-5 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-login-blob absolute -top-32 -left-24 size-96 rounded-full bg-primary/25 blur-[110px]" />
        <div className="animate-login-blob-slow absolute -bottom-32 -right-16 size-[28rem] rounded-full bg-indigo-300/35 blur-[120px] dark:bg-indigo-500/20" />
      </div>

      <div className="animate-login-card-in relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative mb-4 flex size-20 items-center justify-center">
            <div className="animate-login-logo-glow absolute inset-0 rounded-full bg-primary/40 blur-xl" />
            <div className="animate-login-logo-float relative flex size-16 items-center justify-center rounded-2xl border border-black/5 bg-white shadow-lg shadow-zinc-900/10 dark:border-white/10">
              {shop?.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shop.logoDataUrl} alt={shop.name || "Company logo"} className="size-full rounded-2xl object-contain p-1.5" />
              ) : (
                <Scissors className="size-7 text-primary" />
              )}
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{shop?.name || "Fashion Flow"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{done ? "Request received!" : "Get your own shop set up"}</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading && !done) submit();
          }}
          className="space-y-4 rounded-3xl border border-black/5 bg-white/70 p-6 shadow-2xl shadow-zinc-900/10 backdrop-blur-xl sm:p-7 dark:border-white/10 dark:bg-zinc-900/70 dark:shadow-black/40"
        >
          {done ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl border-2 border-emerald-400/60 bg-emerald-50 p-5 shadow-lg shadow-emerald-500/10 dark:border-emerald-500/40 dark:bg-emerald-950/30">
                <div>
                  <p className="text-base font-bold text-emerald-800 dark:text-emerald-300">Try FREE DEMO till we get your personnel login details</p>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm text-emerald-900 dark:bg-black/20 dark:text-emerald-200">
                  <KeyRound className="size-3.5 shrink-0" />
                  <span>
                    Mobile <span className="font-mono font-semibold">{DEMO_USER}</span> · PIN{" "}
                    <span className="font-mono font-semibold">{DEMO_PASSWORD}</span>
                  </span>
                </div>
                <a href={DEMO_URL} target="_blank" rel="noopener noreferrer" className="block">
                  <Button
                    type="button"
                    className="h-12 w-full gap-2 rounded-xl bg-emerald-600 text-base font-semibold text-white shadow-lg shadow-emerald-600/30 transition-transform hover:bg-emerald-700 active:scale-[0.98]"
                  >
                    <PlayCircle className="size-5" />
                    Open FREE DEMO
                  </Button>
                </a>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/70">
                  This is a shared sample shop with fake data, just to explore the app — not your own account.
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-black/5 bg-muted/40 px-3 py-3 text-sm text-muted-foreground dark:border-white/10">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Thanks, {name.split(" ")[0]}! We&apos;ve got your details and will reach out at {email} to set up {shopName}&apos;s own account shortly.</span>
              </div>

              <a href={MARKETING_SITE_URL} className="block">
                <Button type="button" variant="ghost" className="h-10 w-full gap-2 rounded-xl text-sm text-muted-foreground">
                  <ArrowLeft className="size-4" />
                  Back to fashionflow.app
                </Button>
              </a>
            </div>
          ) : (
            <>
              <Field icon={User} label="Your name" autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
              <Field icon={Store} label="Shop name" autoComplete="organization" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Your shop's name" />
              <Field icon={Mail} label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
              <Field icon={Phone} label="Mobile (optional)" type="tel" autoComplete="tel" value={phone} maxLength={10} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit number" />
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-muted-foreground">Anything else? (optional)</Label>
                <div className="relative">
                  <MessageSquare className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tell us a bit about your shop" className="min-h-20 rounded-xl pl-10" />
                </div>
              </div>

              {err && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{err}</span>
                </div>
              )}

              <Button type="submit" className="h-11 w-full rounded-xl text-base font-medium shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {loading ? "Sending…" : "Request my shop"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                We&apos;ll set up your own separate, private account — your data is never shared with any other shop.
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
