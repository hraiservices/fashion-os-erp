import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUser } from "@/lib/auth-server";

const bodySchema = z.object({ apiKey: z.string().min(1) });

/**
 * Validates a Claude API key BEFORE it's saved — lets an admin catch a copy-paste mistake or an
 * expired/restricted key immediately, in Settings, instead of finding out later when every
 * Copilot question quietly fails. Runs the smallest real call the API offers purely to confirm
 * the key authenticates; the response text itself is discarded. Mirrors
 * /api/settings/ai-copilot/test (the Gemini key check).
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  try {
    const client = new Anthropic({ apiKey: parsed.data.apiKey });
    await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8,
      messages: [{ role: "user", content: "Reply with just: ok" }],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The key didn't work" }, { status: 400 });
  }
}
