"use client";

import { isNativePlatform } from "@/lib/capacitor";

export interface AttendanceCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Check In/Out's location fix. `enableHighAccuracy: true` is what makes the geofence check
 * trustworthy (a coarse/cached fix could be hundreds of meters off, letting someone check in
 * from outside the shop) — but acquiring a real GPS fix is the dominant source of the ~3s delay
 * between tapping Check In/Out and seeing it confirmed, since nothing else in the flow happens
 * until this resolves. Trying a short high-accuracy window first and only falling back to a
 * quicker, coarser fix on timeout/failure keeps the common case (good GPS signal) exactly as
 * accurate as before while avoiding a full high-accuracy wait when signal is poor indoors.
 *
 * Native (Capacitor) and browser/PWA go through genuinely different APIs here, not just a
 * cosmetic branch: the installed Android app has no `@capacitor/geolocation` permission plumbing
 * if it only relies on the WebView's own `navigator.geolocation` — without
 * ACCESS_FINE_LOCATION/ACCESS_COARSE_LOCATION declared in AndroidManifest.xml (see that file),
 * the WebView's geolocation bridge has nothing to grant and silently never calls either the
 * success or the error callback, hanging this forever. `@capacitor/geolocation` talks to the real
 * Android location APIs and reliably resolves or rejects. A hard outer timeout below is a second,
 * independent safety net — if anything here still hangs for any other reason, the UI unblocks
 * with a clear error instead of leaving the "Getting your location…" toast stuck forever.
 */
export function getAttendanceLocation(): Promise<{ coords: AttendanceCoords }> {
  const locate = isNativePlatform() ? getNativeLocation() : getBrowserLocation();
  return Promise.race([
    locate,
    new Promise<{ coords: AttendanceCoords }>((_, reject) =>
      setTimeout(() => reject(new Error("Location timed out")), 20_000)
    ),
  ]);
}

async function getNativeLocation(): Promise<{ coords: AttendanceCoords }> {
  const { Geolocation } = await import("@capacitor/geolocation");
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15_000 });
  return { coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy } };
}

function getBrowserLocation(): Promise<{ coords: AttendanceCoords }> {
  const toCoords = (p: GeolocationPosition): { coords: AttendanceCoords } => ({
    coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy },
  });
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(toCoords(p)),
      () => {
        navigator.geolocation.getCurrentPosition((p) => resolve(toCoords(p)), reject, { enableHighAccuracy: false, timeout: 15_000 });
      },
      { enableHighAccuracy: true, timeout: 5_000 }
    );
  });
}
