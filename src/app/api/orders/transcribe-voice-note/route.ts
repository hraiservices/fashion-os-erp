import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { transcribeVoiceNote } from "@/lib/chatbot/gemini";

const bodySchema = z.object({
  audioDataUrl: z.string().min(1),
});

/** Transcribes one voice note (recorded on the order form) into text — same access level as
 *  creating/editing an order itself, no dedicated permission. */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  try {
    const text = await transcribeVoiceNote(parsed.data.audioDataUrl);
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't transcribe that recording" }, { status: 500 });
  }
}
