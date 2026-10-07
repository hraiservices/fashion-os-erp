"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LogIn, LogOut, CheckCircle2, Loader2 } from "lucide-react";
import { CameraModal } from "@/components/orders/camera-modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useAttendanceMe, useInvalidateAttendanceMe } from "@/hooks/use-attendance-me";
import { getAttendanceLocation } from "@/lib/attendance-location";

type Action = "checkin" | "checkout" | null;

/**
 * Check In/Out shortcut for a portal user whose login is linked to an employee record
 * (user_roles.linked_employee_id) — the "I need this in the app itself, not just at /checkin"
 * follow-up. Lives as the first item in the account dropdown menu (above "My Attendance"),
 * not the topbar row itself — narrow phones have no room to spare there. Same rules as
 * /checkin's own attendance tab (selfie + GPS geofence, and a required "what did you do today"
 * note before checkout for every role except tailors) — this is just a second entry point into
 * the exact same /api/attendance/* endpoints, not a relaxed one.
 *
 * Split into a hook (all the state/handlers) plus two separate render pieces — menu items vs.
 * modals — because the work-note Dialog and CameraModal must NOT be mounted as descendants of
 * the account dropdown's DropdownMenuContent. Base UI's Menu keeps its own keyboard handling
 * (roving focus, typeahead-to-select) live for as long as the menu is open/mounted, and that
 * swallowed every keystroke typed into the dialog's textarea before it arrived (paste went
 * through fine since it's a different event path — looked exactly like "typing is disabled").
 * The dropdown uses closeOnClick={false} so clicking Check In/Out doesn't itself dismiss the
 * menu, which used to mean the menu stayed open (and kept intercepting keys) for the entire
 * dialog/camera flow. Rendering the modals as siblings of the menu instead of children fixes
 * this regardless of the menu's own open/close state or animation timing.
 */
export function useAttendanceWidget({ onDone }: { onDone?: () => void } = {}) {
  const { data: user } = useCurrentUser();
  const { data: me, isLoading } = useAttendanceMe(user?.employeeId);
  const invalidateMe = useInvalidateAttendanceMe();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<Action>(null);
  const [submitting, setSubmitting] = useState(false);
  const [workNoteOpen, setWorkNoteOpen] = useState(false);
  const [workNote, setWorkNote] = useState("");
  const [workNoteError, setWorkNoteError] = useState(false);

  const isTailor = (me?.employee.role || "").toLowerCase().includes("tailor");

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

  // photo is omitted entirely on desktops with no camera/permission — see CameraModal's onSkip.
  // The API routes accept a missing photo (GPS geofencing still gates the check-in/out either
  // way); this just means the attendance record has no selfie attached for that one entry.
  async function handlePhotoCapture(photo?: string) {
    if (!pendingAction) return;
    setSubmitting(true);
    // A loading toast (rather than nothing visible) during the location fix — getAttendanceLocation
    // can still take a couple of seconds on poor GPS signal, and this was the single biggest
    // source of "did my tap even register?" during that wait. Reused by id so it becomes the
    // success/error toast in place rather than stacking a second one.
    const toastId = toast.loading("Getting your location…");
    let position: Awaited<ReturnType<typeof getAttendanceLocation>>;
    try {
      position = await getAttendanceLocation();
    } catch {
      toast.error("Couldn't get your location — check location permission and try again.", { id: toastId });
      setSubmitting(false);
      setPendingAction(null);
      return;
    }
    try {
      const res = await fetch(`/api/attendance/${pendingAction}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          ...(photo ? { photo } : {}),
          ...(pendingAction === "checkout" ? { workNotes: workNote } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed", { id: toastId });
        return;
      }
      toast.success(pendingAction === "checkin" ? "Checked in!" : "Checked out!", { id: toastId });
      setWorkNote("");
      await invalidateMe(user?.employeeId);
      onDone?.();
    } catch {
      toast.error("Network error — try again.", { id: toastId });
    } finally {
      setSubmitting(false);
      setPendingAction(null);
    }
  }

  return {
    user,
    me,
    isLoading,
    submitting,
    cameraOpen,
    setCameraOpen,
    pendingAction,
    setPendingAction,
    workNoteOpen,
    setWorkNoteOpen,
    workNote,
    setWorkNote,
    workNoteError,
    setWorkNoteError,
    startAction,
    submitWorkNote,
    handlePhotoCapture,
  };
}

type AttendanceController = ReturnType<typeof useAttendanceWidget>;

/** Renders inside the account dropdown's DropdownMenuContent — just the menu items, no modals. */
export function AttendanceMenuItems({ controller }: { controller: AttendanceController }) {
  const { user, me, isLoading, submitting, startAction } = controller;

  // Nothing at all for a login with no linked employee — most portal users (e.g. an owner with
  // no attendance record) see no widget. While the (now-prefetched, see useAttendanceMe) status
  // is still in flight, show a disabled placeholder rather than nothing — the item used to pop
  // in and shift the menu's height once the fetch resolved; this keeps the slot reserved instead.
  if (!user?.employeeId) return null;
  if (isLoading) {
    return (
      <DropdownMenuItem disabled>
        <Loader2 className="size-4 animate-spin" /> Checking status…
      </DropdownMenuItem>
    );
  }

  return (
    <>
      {!me?.checkedInAt && (
        <DropdownMenuItem closeOnClick={false} disabled={submitting} onClick={() => startAction("checkin")}>
          <LogIn className="size-4" /> Check In
        </DropdownMenuItem>
      )}
      {me?.checkedInAt && !me.checkedOutAt && (
        <DropdownMenuItem closeOnClick={false} disabled={submitting} onClick={() => startAction("checkout")}>
          <LogOut className="size-4" /> Check Out
        </DropdownMenuItem>
      )}
      {me?.checkedInAt && me.checkedOutAt && (
        <DropdownMenuItem disabled className="text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> Checked out for today
        </DropdownMenuItem>
      )}
    </>
  );
}

/** Renders as a sibling of the account dropdown (NOT inside DropdownMenuContent) — see the
 *  file-level comment on why these can't be descendants of the menu. */
export function AttendanceActionModals({ controller }: { controller: AttendanceController }) {
  const { cameraOpen, setCameraOpen, setPendingAction, handlePhotoCapture, workNoteOpen, setWorkNoteOpen, workNote, setWorkNote, workNoteError, setWorkNoteError, submitWorkNote } = controller;

  return (
    <>
      <CameraModal
        open={cameraOpen}
        onOpenChange={(v) => {
          setCameraOpen(v);
          if (!v) setPendingAction(null);
        }}
        defaultFacing="user"
        onCapture={handlePhotoCapture}
        onSkip={() => handlePhotoCapture()}
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
