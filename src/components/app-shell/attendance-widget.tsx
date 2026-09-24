"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogIn, LogOut, CheckCircle2 } from "lucide-react";
import { CameraModal } from "@/components/orders/camera-modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";

interface AttendanceMe {
  employee: { id: string; name: string; role: string };
  checkedInAt: string | null;
  checkedOutAt: string | null;
  hoursWorked: number | null;
}

type Action = "checkin" | "checkout" | null;

/**
 * Topbar Check In/Out shortcut for a portal user whose login is linked to an employee record
 * (user_roles.linked_employee_id) — the "I need this in the app itself, not just at /checkin"
 * follow-up. Same rules as /checkin's own attendance tab (selfie + GPS geofence, and a required
 * "what did you do today" note before checkout for every role except tailors) — this is just a
 * second entry point into the exact same /api/attendance/* endpoints, not a relaxed one.
 * Renders nothing for a user with no linked employee record.
 */
export function AttendanceWidget() {
  const { data: user } = useCurrentUser();
  const [me, setMe] = useState<AttendanceMe | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<Action>(null);
  const [submitting, setSubmitting] = useState(false);
  const [workNoteOpen, setWorkNoteOpen] = useState(false);
  const [workNote, setWorkNote] = useState("");
  const [workNoteError, setWorkNoteError] = useState(false);

  const isTailor = (me?.employee.role || "").toLowerCase().includes("tailor");

  async function loadMe(triedPortalLogin = false) {
    const res = await fetch("/api/attendance/me");
    if (res.status === 401) {
      if (!triedPortalLogin) {
        const portalRes = await fetch("/api/attendance/portal-login", { method: "POST" });
        if (portalRes.ok) {
          await loadMe(true);
          return;
        }
      }
      setMe(null);
      setLoaded(true);
      return;
    }
    const data = await res.json();
    if (res.ok) setMe(data);
    setLoaded(true);
  }

  useEffect(() => {
    if (user?.employeeId) loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the linked employee itself changes
  }, [user?.employeeId]);

  function startAction(action: "checkin" | "checkout") {
    if (!navigator.geolocation) {
      toast.error("This device doesn't support location — check-in requires it.");
      return;
    }
    if (action === "checkout" && !isTailor) {
      setWorkNote("");
      setWorkNoteError(false);
      setWorkNoteOpen(true);
      return;
    }
    setPendingAction(action);
    setCameraOpen(true);
  }

  function submitWorkNote() {
    if (!workNote.trim()) {
      setWorkNoteError(true);
      return;
    }
    setWorkNoteOpen(false);
    setPendingAction("checkout");
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
              ...(pendingAction === "checkout" ? { workNotes: workNote } : {}),
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            toast.error(data.error || "Failed");
            return;
          }
          toast.success(pendingAction === "checkin" ? "Checked in!" : "Checked out!");
          setWorkNote("");
          await loadMe(true);
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

  // Nothing to show until we know whether this login is linked to an employee, and nothing at
  // all if it isn't — most portal users (e.g. an owner with no attendance record) see no widget.
  if (!user?.employeeId || !loaded) return null;

  return (
    <>
      {!me?.checkedInAt && (
        <Button size="sm" variant="outline" className="gap-1.5" disabled={submitting} onClick={() => startAction("checkin")}>
          <LogIn className="size-4" /> Check In
        </Button>
      )}
      {me?.checkedInAt && !me.checkedOutAt && (
        <Button size="sm" className="gap-1.5" disabled={submitting} onClick={() => startAction("checkout")}>
          <LogOut className="size-4" /> Check Out
        </Button>
      )}
      {me?.checkedInAt && me.checkedOutAt && (
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5" /> Checked out
        </span>
      )}

      <CameraModal
        open={cameraOpen}
        onOpenChange={(v) => {
          setCameraOpen(v);
          if (!v) setPendingAction(null);
        }}
        defaultFacing="user"
        onCapture={handlePhotoCapture}
      />

      <Dialog open={workNoteOpen} onOpenChange={setWorkNoteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add your work done today</DialogTitle>
          </DialogHeader>
          <Textarea
            autoFocus
            rows={6}
            placeholder="A few lines about what you did today (5-10 lines)…"
            value={workNote}
            onChange={(e) => {
              setWorkNote(e.target.value);
              if (workNoteError) setWorkNoteError(false);
            }}
          />
          {workNoteError && <p className="text-sm font-medium text-red-600 dark:text-red-400">Fill your Today Work then Check-Out</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWorkNoteOpen(false)}>Cancel</Button>
            <Button onClick={submitWorkNote}>Continue to Check Out</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
