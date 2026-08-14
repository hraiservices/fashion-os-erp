"use client";

import { MapPin, CheckCircle2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Attendance } from "@/lib/types";

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function mapUrl(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function PunchCard({
  label,
  photo,
  at,
  lat,
  lng,
  distanceM,
  withinGeofence,
}: {
  label: string;
  photo: string | null;
  at: string | null;
  lat: number | null;
  lng: number | null;
  distanceM: number | null;
  withinGeofence: boolean | null;
}) {
  const url = mapUrl(lat, lng);
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={`${label} selfie`} className="mb-2 aspect-square w-full rounded-lg border object-cover" />
      ) : (
        <div className="mb-2 flex aspect-square items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">No photo</div>
      )}
      <p className="text-sm font-medium tabular-nums">{fmtTime(at)}</p>
      {withinGeofence != null && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {withinGeofence ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" /> Within geofence
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
              <AlertTriangle className="size-3.5" /> {distanceM}m away
            </span>
          )}
        </div>
      )}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <MapPin className="size-3" /> View on map
        </a>
      )}
    </div>
  );
}

export function AttendanceDetailDialog({ attendance, employeeName, open, onOpenChange }: { attendance: Attendance; employeeName: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {employeeName}
            <Badge variant="secondary">Self check-in</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <PunchCard
            label="Check-in"
            photo={attendance.checkInPhoto}
            at={attendance.checkInAt}
            lat={attendance.checkInLat}
            lng={attendance.checkInLng}
            distanceM={attendance.checkInDistanceM}
            withinGeofence={attendance.checkInWithinGeofence}
          />
          <PunchCard
            label="Check-out"
            photo={attendance.checkOutPhoto}
            at={attendance.checkOutAt}
            lat={attendance.checkOutLat}
            lng={attendance.checkOutLng}
            distanceM={attendance.checkOutDistanceM}
            withinGeofence={attendance.checkOutWithinGeofence}
          />
        </div>
        {attendance.hoursWorked != null && (
          <p className="text-center text-sm text-muted-foreground">
            {attendance.hoursWorked}h worked{attendance.overtimeHours > 0 ? ` · ${attendance.overtimeHours}h overtime` : ""}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
