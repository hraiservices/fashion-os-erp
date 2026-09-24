import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordLogin } from "@/lib/presence";

const bodySchema = z.object({ method: z.enum(["email", "phone"]) });

/**
 * The one login path with no server-side route of its own: email+password sign-in runs entirely
 * client-side via supabase.auth.signInWithPassword (see login/page.tsx), so there's no server
 * hook to call recordLogin() from directly. Called right after that succeeds, alongside
 * ensureUserRole() — by then the browser's Supabase cookies are already set, so getServerUser()
 * here correctly resolves the just-logged-in identity. (Phone+PIN login is server-side already —
 * /api/auth/phone-login calls recordLogin() itself and never needs this route.)
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ ok: false }, { status: 501 });

  await recordLogin(serviceClient, {
    loginType: "portal",
    method: parsed.data.method,
    email: user.email,
    employeeId: user.employeeId,
    displayName: user.email,
    role: user.role,
  });

  return NextResponse.json({ ok: true });
}
