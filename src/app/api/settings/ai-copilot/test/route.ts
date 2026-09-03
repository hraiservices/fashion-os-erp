import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { getServerUser } from "@/lib/auth-server";

const bodySchema = z.object({ apiKey: z.string().min(1) });

/**
 * Validates a Gemini API key BEFORE it's saved — lets an admin catch a copy-paste mistake or an
 * expired/restricted key immediately, in Settings, instead of finding out later when every
 * Copilot question quietly fails. Runs the smallest real call the API offers (no schema, no
 * system prompt) purely to confirm the key authenticates; the response text itself is discarded.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  try {
    const ai = new GoogleGenAI({ apiKey: parsed.data.apiKey });
    await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [{ role: "user", parts: [{ text: "Reply with just: ok" }] }],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The key didn't work" }, { status: 400 });
  }
}
