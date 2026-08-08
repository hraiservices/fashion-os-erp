"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureUserRole } from "@/lib/supabase/role-bootstrap";
import { isValidEmail, mapAuthError, normalizePhone } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

type Mode = "login" | "signup" | "forgot" | "reset";
type Method = "email" | "mobile";

// Multi-mode auth widget (login/signup/forgot/reset × email/mobile) ported from
// LoginScreen in Stitching_Manager_Pro_v16.html (~line 3435). Kept as local state
// rather than react-hook-form/zod because the branching validation per mode doesn't
// map cleanly to one schema — see business-rule comments inline for the exact ports.
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

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
      if (!email || !isValidEmail(email)) return setErr("Enter a valid email address.");
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      setLoading(false);
      if (error) return setErr(error.message || "Failed to send reset email.");
      setOk("Password reset email sent! Check your inbox.");
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
    setLoading(true);

    if (mode === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error || !data.session) {
        setLoading(false);
        return setErr(mapAuthError(error?.message));
      }
      await ensureUserRole(supabase, email);
      setLoading(false);
      router.push("/dashboard");
    } else {
      const { error } = await supabase.auth.signUp({
        email,
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
    <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-blue-950 via-zinc-950 to-zinc-700 p-5">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Stitching Manager Pro</CardTitle>
          <CardDescription>
            {mode === "reset"
              ? "Set a new password"
              : mode === "forgot"
                ? "Reset your password"
                : mode === "signup"
                  ? "Create your account"
                  : "Sign in to continue"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {(mode === "login" || mode === "signup") && (
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
            <div className="space-y-2">
              <Label>New password</Label>
              <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            </div>
          )}

          {mode === "forgot" && (
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
            </div>
          )}

          {isMobileFlow && (
            <>
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
                </div>
              )}
              <div className="space-y-2">
                <Label>Mobile number</Label>
                <Input
                  type="tel"
                  value={phone}
                  maxLength={10}
                  placeholder="10-digit number"
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
              </div>
            </>
          )}

          {isEmailFlow && (
            <>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
              </div>
            </>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
          {ok && <p className="text-sm text-green-600">{ok}</p>}

          <Button className="w-full" disabled={loading} onClick={go}>
            {loading ? "Please wait…" : mode === "reset" ? "Update password" : mode === "forgot" ? "Send reset email" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>

          {mode === "login" && (
            <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setMode("forgot")}>
              Forgot password?
            </button>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setMode("login")}>
              Back to sign in
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
