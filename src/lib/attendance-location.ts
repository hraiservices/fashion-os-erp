"use client";

/**
 * Check In/Out's location fix. `enableHighAccuracy: true` is what makes the geofence check
 * trustworthy (a coarse/cached fix could be hundreds of meters off, letting someone check in
 * from outside the shop) — but acquiring a real GPS fix is the dominant source of the ~3s delay
 * between tapping Check In/Out and seeing it confirmed, since nothing else in the flow happens
 * until this resolves. Trying a short high-accuracy window first and only falling back to a
 * quicker, coarser fix on timeout/failure keeps the common case (good GPS signal) exactly as
 * accurate as before while avoiding a full high-accuracy wait when signal is poor indoors.
 */
export function getAttendanceLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      () => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15_000 });
      },
      { enableHighAccuracy: true, timeout: 5_000 }
    );
  });
}
