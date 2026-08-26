import { NextResponse } from "next/server";

/**
 * TEMPORARY diagnostic — never returns the actual secret, only whether it's set and how long
 * it is, to debug why ATTENDANCE_SESSION_SECRET isn't reaching the deployed app despite being
 * present in Vercel's dashboard and a fresh rebuild. Delete this route once resolved.
 */
export async function GET() {
  const secret = process.env.ATTENDANCE_SESSION_SECRET;
  return NextResponse.json({
    hasSecret: !!secret,
    secretLength: secret?.length || 0,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV || null,
  });
}
