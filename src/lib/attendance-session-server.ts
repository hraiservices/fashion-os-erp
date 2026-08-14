import { cookies } from "next/headers";
import { verifyAttendanceToken, ATTENDANCE_COOKIE_NAME } from "@/lib/attendance-auth";

/** Reads and verifies the attendance-session cookie for the current request. Returns null if
 *  absent, malformed, expired, or the signature doesn't match — callers should treat any null
 *  as "not logged in" and respond 401. */
export async function getAttendanceEmployeeId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ATTENDANCE_COOKIE_NAME)?.value;
  try {
    return verifyAttendanceToken(token)?.employeeId ?? null;
  } catch {
    // ATTENDANCE_SESSION_SECRET missing/misconfigured — treat as "not logged in", not a crash.
    return null;
  }
}
