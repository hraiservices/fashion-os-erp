import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Self-service attendance is a deliberately SEPARATE auth mechanism from the app's normal
 * Supabase Auth login (see the Phase 1 commit) — an employee's PIN can only ever reach the
 * check-in/out endpoints below, never the rest of the app, and is verified independently of
 * user_roles/permissions. This file is the whole trust boundary for that mechanism; keep it
 * narrow.
 */

const PIN_REGEX = /^\d{4,6}$/;

export function isValidPin(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

const COOKIE_NAME = "attendance_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12h — long enough to cover check-in through check-out on one shift.

function getSecret(): string {
  const secret = process.env.ATTENDANCE_SESSION_SECRET;
  if (!secret) throw new Error("ATTENDANCE_SESSION_SECRET is not configured — self-service attendance is disabled until it is set.");
  return secret;
}

/** Callers that can react gracefully (e.g. return a clean 503) should check this first,
 *  rather than let signAttendanceToken/verifyAttendanceToken throw. */
export function isAttendanceConfigured(): boolean {
  return !!process.env.ATTENDANCE_SESSION_SECRET;
}

interface SessionPayload {
  employeeId: string;
  exp: number; // unix seconds
}

/** HMAC-signed token, not a full JWT library — this token has exactly one claim (employeeId)
 *  and one purpose, so a hand-rolled signed payload is simpler than pulling in a JWT dependency
 *  for it. Format: base64url(json).base64url(hmac-sha256). */
export function signAttendanceToken(employeeId: string): string {
  const payload: SessionPayload = { employeeId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyAttendanceToken(token: string | undefined | null): { employeeId: string } | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expectedSig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.employeeId !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { employeeId: payload.employeeId };
  } catch {
    return null;
  }
}

export const ATTENDANCE_COOKIE_NAME = COOKIE_NAME;
export const ATTENDANCE_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;
