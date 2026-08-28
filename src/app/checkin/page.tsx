"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, LogOut, MapPin, CheckCircle2, Clock, History, Umbrella, Send, X } from "lucide-react";
import { CameraModal } from "@/components/orders/camera-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countLeaveDays } from "@/lib/leave";
import type { LeaveBalanceSummary, LeaveRequest, LeaveType } from "@/lib/types";

interface MeResponse {
  employee: { id: string; name: string; role: string };
  location: { name: string; hasCoordinates: boolean } | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  hoursWorked: number | null;
  overtimeHours: number;
}

interface HistoryDay {
  date: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  hoursWorked: number | null;
  overtimeHours: number;
}

interface LeaveBalanceResponse {
  year: number;
  balances: LeaveBalanceSummary[];
  holidayDates: string[];
  weeklyOffDay: number | null;
}

interface EarningsResponse {
  eligible: boolean;
  weekConfirmed?: number;
  monthConfirmed?: number;
  pendingConfirmation?: number;
  allTimeConfirmed?: number;
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function fmtDayShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

type Step = "login" | "loading" | "ready";
type Action = "checkin" | "checkout" | null;
type MainTab = "attendance" | "leave" | "earnings";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<string, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" };
const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  rejected: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  cancelled: "bg-muted text-muted-foreground",
};

/** Employee self-service — attendance (selfie + GPS check-in/out) and leave (balance, apply,
 *  history). Deliberately outside the (app) route group: this has no relationship to the
 *  normal Supabase Auth login (see lib/attendance-auth.ts), so it must not inherit that
 *  layout's auth gate. */
export default function CheckInPage() {
  const [step, setStep] = useState<Step>("login");
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [me, setMe] = useState<MeResponse | null>(null);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<Action>(null);
  const [submitting, setSubmitting] = useState(false);

  const [tab, setTab] = useState<MainTab>("attendance");
  const [earnings, setEarnings] = useState<EarningsResponse | null>(null);
  const [leaveLoaded, setLeaveLoaded] = useState(false);
  const [leaveData, setLeaveData] = useState<LeaveBalanceResponse | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");
  const [applying, setApplying] = useState(false);

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
      // Fetched eagerly (not lazily like leave) since the Earnings tab itself is only shown
      // when eligible=true — we need to know that before deciding what tabs to render.
      fetch("/api/attendance/earnings")
        .then((r) => r.json())
        .then((d) => setEarnings(d))
        .catch(() => {});
    }
  }

  async function loadHistory() {
    const res = await fetch("/api/attendance/history");
    if (res.ok) {
      const data = await res.json();
      setHistory(data.days || []);
    }
  }

  async function loadLeave() {
    const [balanceRes, requestsRes] = await Promise.all([fetch("/api/attendance/leave-balance"), fetch("/api/attendance/leave-requests")]);
    if (balanceRes.ok) setLeaveData(await balanceRes.json());
    if (requestsRes.ok) {
      const data = await requestsRes.json();
      setLeaveRequests(data.requests || []);
      setLeaveTypes(data.leaveTypes || []);
    }
    setLeaveLoaded(true);
  }

  useEffect(() => {
    // loadMe is async — the setState calls inside it happen after the fetch resolves, not
    // synchronously in this effect body (the linter's static analysis can't see past the await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMe();
  }, []);

  useEffect(() => {
    if (step === "ready" && tab === "leave" && !leaveLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadLeave();
    }
  }, [step, tab, leaveLoaded]);

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
    setLeaveLoaded(false);
    setEarnings(null);
    setTab("attendance");
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

  async function handleApplyLeave() {
    if (!leaveTypeId) return toast.error("Choose a leave type");
    if (toDate < fromDate) return toast.error("To date must be on or after from date");
    setApplying(true);
    try {
      const res = await fetch("/api/attendance/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveTypeId, fromDate, toDate, halfDay: fromDate === toDate ? halfDay : false, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to apply");
        return;
      }
      toast.success("Leave request submitted");
      setApplyOpen(false);
      setLeaveTypeId("");
      setReason("");
      setHalfDay(false);
      await loadLeave();
    } catch {
      toast.error("Network error — try again.");
    } finally {
      setApplying(false);
    }
  }

  async function handleCancelRequest(id: string) {
    try {
      const res = await fetch(`/api/attendance/leave-requests/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to cancel");
        return;
      }
      toast.success("Request cancelled");
      await loadLeave();
    } catch {
      toast.error("Network error — try again.");
    }
  }

  const previewDays =
    leaveData && fromDate && toDate && toDate >= fromDate
      ? countLeaveDays(fromDate, toDate, fromDate === toDate && halfDay, new Set(leaveData.holidayDates), leaveData.weeklyOffDay).days
      : 0;
  const selectedBalance = leaveData?.balances.find((b) => b.leaveTypeId === leaveTypeId);

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

            <div className="flex gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setTab("attendance")}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${tab === "attendance" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                Attendance
              </button>
              <button
                type="button"
                onClick={() => setTab("leave")}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${tab === "leave" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                Leave
              </button>
              {earnings?.eligible && (
                <button
                  type="button"
                  onClick={() => setTab("earnings")}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${tab === "earnings" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                >
                  Earnings
                </button>
              )}
            </div>

            {tab === "attendance" && (
              <div className="space-y-3">
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

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1.5 text-muted-foreground"
                  onClick={() => {
                    if (!showHistory) loadHistory();
                    setShowHistory((v) => !v);
                  }}
                >
                  <History className="size-3.5" /> {showHistory ? "Hide history" : "View my history"}
                </Button>

                {showHistory && (
                  <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border p-2">
                    {history.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">No attendance history yet</p>
                    ) : (
                      history.map((d) => (
                        <div key={d.date} className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs">
                          <span className="font-medium">{fmtDayShort(d.date)}</span>
                          <span className="text-muted-foreground">
                            {d.checkInAt ? fmtTime(d.checkInAt) : "—"} – {d.checkOutAt ? fmtTime(d.checkOutAt) : "—"}
                          </span>
                          <span className="tabular-nums text-muted-foreground">{d.hoursWorked != null ? `${d.hoursWorked}h` : "—"}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === "leave" && (
              <div className="space-y-3">
                {!leaveData ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
                ) : (
                  <>
                    {leaveData.balances.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {leaveData.balances.map((b) => (
                          <div key={b.leaveTypeId} className="rounded-lg border p-2 text-center">
                            <p className="text-base font-semibold tabular-nums">{b.remaining}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{b.leaveTypeName}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {!applyOpen ? (
                      <Button variant="outline" className="h-11 w-full gap-2" onClick={() => setApplyOpen(true)}>
                        <Umbrella className="size-4" /> Apply for leave
                      </Button>
                    ) : (
                      <div className="space-y-2.5 rounded-lg border p-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Leave type</Label>
                          <Select value={leaveTypeId} onValueChange={(v) => v && setLeaveTypeId(v)}>
                            <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
                            <SelectContent>
                              {leaveTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">From</Label>
                            <DatePicker value={fromDate} onChange={setFromDate} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">To</Label>
                            <DatePicker value={toDate} onChange={setToDate} />
                          </div>
                        </div>
                        {fromDate === toDate && (
                          <label className="flex items-center gap-1.5 text-xs">
                            <input type="checkbox" className="size-4 rounded" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} />
                            Half day
                          </label>
                        )}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Reason (optional)</Label>
                          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
                        </div>
                        {leaveTypeId && (
                          <p className="text-[11px] text-muted-foreground">
                            This request uses <span className="font-medium text-foreground">{previewDays}</span> day(s).
                            {selectedBalance && (
                              <>
                                {" "}Remaining after: <span className="font-medium text-foreground">{Math.max(0, selectedBalance.remaining - previewDays)}</span> of {selectedBalance.remaining}.
                              </>
                            )}
                          </p>
                        )}
                        <div className="flex gap-1.5">
                          <Button variant="ghost" size="sm" className="flex-1" onClick={() => setApplyOpen(false)}>Cancel</Button>
                          <Button size="sm" className="flex-1 gap-1.5" onClick={handleApplyLeave} disabled={applying}>
                            <Send className="size-3.5" /> {applying ? "Submitting…" : "Submit"}
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <h3 className="text-xs font-semibold text-muted-foreground">My requests</h3>
                      {leaveRequests.length === 0 ? (
                        <p className="py-3 text-center text-xs text-muted-foreground">No requests yet</p>
                      ) : (
                        <div className="max-h-56 space-y-1.5 overflow-y-auto">
                          {leaveRequests.map((r) => (
                            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs">
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {fmtDayShort(r.fromDate)}{r.toDate !== r.fromDate ? ` – ${fmtDayShort(r.toDate)}` : ""} ({r.days}d)
                                </p>
                                <span className={`inline-block rounded-full px-1.5 py-0 text-[10px] ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                              </div>
                              {r.status === "pending" && (
                                <button type="button" onClick={() => handleCancelRequest(r.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Cancel request">
                                  <X className="size-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === "earnings" && earnings?.eligible && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-lg font-semibold tabular-nums">{inr(earnings.weekConfirmed || 0)}</p>
                    <p className="text-[11px] text-muted-foreground">This week</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-lg font-semibold tabular-nums">{inr(earnings.monthConfirmed || 0)}</p>
                    <p className="text-[11px] text-muted-foreground">This month</p>
                  </div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-lg font-semibold tabular-nums">{inr(earnings.allTimeConfirmed || 0)}</p>
                  <p className="text-[11px] text-muted-foreground">Confirmed, all-time</p>
                </div>
                {(earnings.pendingConfirmation || 0) > 0 && (
                  <div className="rounded-lg bg-amber-50 p-3 text-center dark:bg-amber-950/40">
                    <p className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">{inr(earnings.pendingConfirmation || 0)}</p>
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">Awaiting manager confirmation — not yet final</p>
                  </div>
                )}
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
