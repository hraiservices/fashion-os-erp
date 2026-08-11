"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Phone, Scissors, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ensureUserRole } from "@/lib/supabase/role-bootstrap";
import { isValidEmail, mapAuthError, normalizePhone } from "@/lib/auth-errors";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Mode = "login" | "signup" | "forgot" | "reset";
type Method = "email" | "mobile";

/** Label + icon-prefixed input, styled for the login card's glass background. Password fields get a show/hide toggle so customers typing blind on mobile can check what they entered. */
function IconField({
  icon: Icon,
  label,
  type,
  ...inputProps
}: { icon: typeof Mail; label: string } & React.ComponentProps<typeof Input>) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input {...inputProps} type={isPassword && reveal ? "text" : type} className={cn("h-11 rounded-xl pl-10", isPassword && "pr-10")} />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

// Multi-mode auth widget (login/signup/forgot/reset × email/mobile) ported from
// LoginScreen in Stitching_Manager_Pro_v16.html (~line 3435). Kept as local state
// rather than react-hook-form/zod because the branching validation per mode doesn't
// map cleanly to one schema — see business-rule comments inline for the exact ports.
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const { data: shop } = useShopSettings();

  const [mode, setMode] = useState<Mode>("login");
  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pass, setPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setMode("reset");
    }
  }, []);

  async function go() {
    setErr("");
    setOk("");

    if (mode === "reset") {
      if (!newPass) return setErr("Please enter a new password.");
      if (newPass.length < 6) return setErr("Password must be at least 6 characters.");
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password: newPass });
      setLoading(false);
      if (error) return setErr(error.message || "Failed to reset password.");
      setOk("Password updated! Please sign in.");
      window.location.hash = "";
      setMode("login");
      return;
    }

    if (mode === "forgot") {
      let targetEmail = email.toLowerCase().trim();
      if (method === "mobile") {
        const ph = normalizePhone(phone);
        if (ph.length !== 10) return setErr("Enter a valid 10-digit mobile number.");
        setLoading(true);
        const { data: rows, error: lookupError } = await supabase.from("user_roles").select("email").eq("phone", ph);
        if (lookupError || !rows || rows.length === 0) {
          setLoading(false);
          return setErr("Mobile number not registered. Ask admin to add your number.");
        }
        targetEmail = rows[0].email;
      } else if (!targetEmail || !isValidEmail(targetEmail)) {
        return setErr("Enter a valid email address.");
      }
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      setLoading(false);
      if (error) return setErr(error.message || "Failed to send reset email.");
      setOk(method === "mobile" ? "Password reset email sent to your registered email address. Check your inbox." : "Password reset email sent! Check your inbox.");
      return;
    }

    if (method === "mobile" && mode === "login") {
      const ph = normalizePhone(phone);
      if (ph.length !== 10) return setErr("Enter a valid 10-digit mobile number.");
      if (!pass) return setErr("Password is required.");
      setLoading(true);
      const { data: rows, error: lookupError } = await supabase
        .from("user_roles")
        .select("email")
        .eq("phone", ph);
      if (lookupError || !rows || rows.length === 0) {
        setLoading(false);
        return setErr("Mobile number not registered. Ask admin to add your number.");
      }
      const foundEmail = rows[0].email;
      const { data, error } = await supabase.auth.signInWithPassword({ email: foundEmail, password: pass });
      if (error || !data.session) {
        setLoading(false);
        return setErr(mapAuthError(error?.message));
      }
      await ensureUserRole(supabase, foundEmail);
      setLoading(false);
      router.push("/dashboard");
      return;
    }

    if (method === "mobile" && mode === "signup") {
      if (!email) return setErr("Email is required to create account.");
      if (!isValidEmail(email)) return setErr("Enter a valid email address.");
      const ph2 = normalizePhone(phone);
      if (ph2.length !== 10) return setErr("Enter a valid 10-digit mobile number.");
      if (!pass) return setErr("Password is required.");
      if (pass.length < 6) return setErr("Password must be at least 6 characters.");
      setLoading(true);
      const cleanEmail = email.toLowerCase().trim();
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: pass,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) {
        setLoading(false);
        return setErr(error.message || "Sign up failed.");
      }
      if (signUpData.session) {
        await ensureUserRole(supabase, cleanEmail, ph2);
      } else {
        // Not confirmed yet — best-effort bootstrap with the anon key, matching old app behavior;
        // RLS may reject this until the user confirms and signs in, which is fine (non-fatal).
        await ensureUserRole(supabase, cleanEmail, ph2).catch(() => {});
      }
      setLoading(false);
      setOk("Account created! Check your email to confirm, then sign in.");
      setMode("login");
      return;
    }

    // Email login / signup
    if (!email || !pass) return setErr("Email & password required.");
    if (!isValidEmail(email)) return setErr("Enter a valid email address.");
    if (mode === "signup" && pass.length < 6) return setErr("Password must be at least 6 characters.");
    const cleanEmail = email.toLowerCase().trim();
    setLoading(true);

    if (mode === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: pass });
      if (error || !data.session) {
        setLoading(false);
        return setErr(mapAuthError(error?.message));
      }
      await ensureUserRole(supabase, cleanEmail);
      setLoading(false);
      router.push("/dashboard");
    } else {
      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: pass,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      setLoading(false);
      if (error) return setErr(error.message || "Sign up failed.");
      setOk("Check your email to confirm, then sign in.");
      setMode("login");
    }
  }

  const isMobileFlow = (mode === "login" || mode === "signup") && method === "mobile";
  const isEmailFlow = (mode === "login" || mode === "signup") && method === "email";

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 p-5">
      {/* Animated aurora backdrop — purely decorative, sits behind everything. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-login-blob absolute -top-32 -left-24 size-96 rounded-full bg-primary/25 blur-[110px]" />
        <div className="animate-login-blob-slow absolute -bottom-32 -right-16 size-[28rem] rounded-full bg-indigo-300/35 blur-[120px]" />
        <div className="animate-login-blob absolute top-1/3 right-1/4 size-72 rounded-full bg-fuchsia-300/30 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(255,255,255,0.55)_100%)]" />
      </div>

      <div className="animate-login-card-in relative z-10 w-full max-w-md">
        {/* Logo — glowing halo behind, gentle float loop. */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative mb-4 flex size-20 items-center justify-center">
            <div className="animate-login-logo-glow absolute inset-0 rounded-full bg-primary/40 blur-xl" />
            <div className="animate-login-logo-float relative flex size-16 items-center justify-center rounded-2xl border border-black/5 bg-white shadow-lg shadow-zinc-900/10">
              {shop?.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shop.logoDataUrl} alt={shop.name || "Shop logo"} className="size-full rounded-2xl object-contain p-1.5" />
              ) : (
                <Scissors className="size-7 text-primary" />
              )}
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{shop?.name || "Fashion Flow"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "reset"
              ? "Set a new password"
              : mode === "forgot"
                ? "Reset your password"
                : mode === "signup"
                  ? "Create your account"
                  : "Sign in to continue"}
          </p>
        </div>

        {/* Glass card */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) go();
          }}
          className="space-y-4 rounded-3xl border border-black/5 bg-white/70 p-6 shadow-2xl shadow-zinc-900/10 backdrop-blur-xl sm:p-7"
        >
          {(mode === "login" || mode === "signup") && (
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="w-full">
                <TabsTrigger value="login" className="flex-1">
                  Sign in
                </TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">
                  Sign up
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {mode !== "reset" && (
            <Tabs value={method} onValueChange={(v) => setMethod(v as Method)}>
              <TabsList className="w-full">
                <TabsTrigger value="email" className="flex-1">
                  Email
                </TabsTrigger>
                <TabsTrigger value="mobile" className="flex-1">
                  Mobile
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {mode === "reset" && (
            <IconField icon={Lock} label="New password" type="password" autoComplete="new-password" autoFocus value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          )}

          {mode === "forgot" && method === "email" && (
            <IconField icon={Mail} label="Email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
          )}

          {mode === "forgot" && method === "mobile" && (
            <>
              <IconField
                icon={Phone}
                label="Mobile number"
                type="tel"
                autoComplete="tel"
                autoFocus
                value={phone}
                maxLength={10}
                placeholder="10-digit number"
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
              <p className="text-xs text-muted-foreground">We&apos;ll send a reset link to the email address linked to this number.</p>
            </>
          )}

          {isMobileFlow && (
            <>
              {mode === "signup" && (
                <>
                  <IconField icon={Mail} label="Email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
                  <p className="-mt-2 text-xs text-muted-foreground">Used to confirm your account and for password resets.</p>
                </>
              )}
              <IconField
                icon={Phone}
                label="Mobile number"
                type="tel"
                autoComplete="tel"
                autoFocus={mode === "login"}
                value={phone}
                maxLength={10}
                placeholder="10-digit number"
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
              <IconField icon={Lock} label="Password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={pass} onChange={(e) => setPass(e.target.value)} />
            </>
          )}

          {isEmailFlow && (
            <>
              <IconField icon={Mail} label="Email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
              <IconField
                icon={Lock}
                label="Password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
            </>
          )}

          {err && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}
          {ok && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>{ok}</span>
            </div>
          )}

          <Button type="submit" className="h-11 w-full rounded-xl text-base font-medium shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Please wait…" : mode === "reset" ? "Update password" : mode === "forgot" ? "Send reset email" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>

          {mode === "login" && (
            <button type="button" className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setMode("forgot")}>
              Forgot password?
            </button>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <button type="button" className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setMode("login")}>
              Back to sign in
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
