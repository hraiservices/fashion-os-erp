"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, LogOut, MapPin, CheckCircle2, Clock } from "lucide-react";
import { CameraModal } from "@/components/orders/camera-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MeResponse {
  employee: { id: string; name: string; role: string };
  location: { name: string; hasCoordinates: boolean } | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  hoursWorked: number | null;
  overtimeHours: number;
}

type Step = "login" | "loading" | "ready";
type Action = "checkin" | "checkout" | null;

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** Employee self-service attendance — selfie + GPS check-in/out. Deliberately outside the
 *  (app) route group: this has no relationship to the normal Supabase Auth login (see
 *  lib/attendance-auth.ts), so it must not inherit that layout's auth gate. */
export default function CheckInPage() {
  const [step, setStep] = useState<Step>("login");
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [me, setMe] = useState<MeResponse | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<Action>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadMe() {
    const res = await fetch("/api/attendance/me");
    if (res.status === 401) {
      setStep("login");
      return;
    }
    const data = await res.json();
    if (res.ok) {
      setMe(data);
      setStep("ready");
    }
  }

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch("/api/attendance/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: mobile.trim(), pin: pin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Login failed");
        return;
      }
      setPin("");
      await loadMe();
    } catch {
      setLoginError("Network error — try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/attendance/logout", { method: "POST" });
    setMe(null);
    setMobile("");
    setStep("login");
  }

  function startAction(action: Action) {
    if (!navigator.geolocation) {
      toast.error("This device doesn't support location — check-in requires it.");
      return;
    }
    setPendingAction(action);
    setCameraOpen(true);
  }

  async function handlePhotoCapture(photo: string) {
    if (!pendingAction) return;
    setSubmitting(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await fetch(`/api/attendance/${pendingAction}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
              photo,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            toast.error(data.error || "Failed");
            return;
          }
          toast.success(pendingAction === "checkin" ? "Checked in!" : "Checked out!");
          await loadMe();
        } catch {
          toast.error("Network error — try again.");
        } finally {
          setSubmitting(false);
          setPendingAction(null);
        }
      },
      () => {
        toast.error("Location permission is required to check in/out.");
        setSubmitting(false);
        setPendingAction(null);
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Clock className="size-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Attendance Check-In</h1>
        </div>

        {step === "login" && (
          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Mobile number</Label>
              <Input type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit number" className="h-11" value={mobile} onChange={(e) => setMobile(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">PIN</Label>
              <Input type="password" inputMode="numeric" maxLength={6} placeholder="4-6 digit PIN" className="h-11" value={pin} onChange={(e) => setPin(e.target.value)} required />
            </div>
            {loginError && <p className="text-xs text-destructive">{loginError}</p>}
            <Button type="submit" className="h-11 w-full" disabled={loggingIn}>
              {loggingIn ? "Logging in…" : "Log in"}
            </Button>
          </form>
        )}

        {step === "ready" && me && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-sm font-medium">{me.employee.name}</p>
              <p className="text-xs text-muted-foreground">{me.employee.role}</p>
              {me.location && (
                <p className="mt-1 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="size-3" /> {me.location.name}
                </p>
              )}
            </div>

            {me.checkedInAt && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className="text-muted-foreground">Checked in</span>
                <span className="font-medium tabular-nums">{fmtTime(me.checkedInAt)}</span>
              </div>
            )}
            {me.checkedOutAt && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className="text-muted-foreground">Checked out</span>
                <span className="font-medium tabular-nums">{fmtTime(me.checkedOutAt)}</span>
              </div>
            )}

            {!me.checkedInAt && (
              <Button className="h-12 w-full gap-2" disabled={submitting} onClick={() => startAction("checkin")}>
                <Camera className="size-4" /> Check In
              </Button>
            )}
            {me.checkedInAt && !me.checkedOutAt && (
              <Button className="h-12 w-full gap-2" disabled={submitting} onClick={() => startAction("checkout")}>
                <Camera className="size-4" /> Check Out
              </Button>
            )}
            {me.checkedInAt && me.checkedOutAt && (
              <div className="rounded-lg bg-emerald-50 p-3 text-center dark:bg-emerald-950/40">
                <CheckCircle2 className="mx-auto mb-1 size-5 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Done for today</p>
                <p className="text-xs text-muted-foreground">
                  {me.hoursWorked ?? 0}h worked{me.overtimeHours > 0 ? ` · ${me.overtimeHours}h overtime` : ""}
                </p>
              </div>
            )}

            <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground" onClick={handleLogout}>
              <LogOut className="size-3.5" /> Log out
            </Button>
          </div>
        )}
      </div>

      <CameraModal
        open={cameraOpen}
        onOpenChange={(v) => {
          setCameraOpen(v);
          if (!v) setPendingAction(null);
        }}
        defaultFacing="user"
        onCapture={handlePhotoCapture}
      />
    </div>
  );
}
