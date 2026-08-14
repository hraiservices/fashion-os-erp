import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ATTENDANCE_COOKIE_NAME } from "@/lib/attendance-auth";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(ATTENDANCE_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
