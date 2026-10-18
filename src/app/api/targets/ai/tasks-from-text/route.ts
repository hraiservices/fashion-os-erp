import { NextResponse } from "next/server";
import { z } from "zod";
import { aiErrorResponse, aiJson, SHOP_VOICE } from "@/lib/ai-assist";
import { istDateString } from "@/lib/ist-date";
import { isRealDate, parseBody, text } from "@/lib/targets-api";
import { targetsContext } from "@/lib/targets-server";

const bodySchema = z.object({ text: text(4000).min(5, "Paste or type some text first") });

/** POST — turns a pasted chat, note or dictation into proposed tasks. Nothing is created here; the page shows them for review. */
export async function POST(request: Request) {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  const body = await parseBody(request, bodySchema);
  if ("error" in body) return body.error;
  const today = istDateString();
  try {
    const out = await aiJson<{ tasks?: { title?: string; description?: string; dueDate?: string | null }[] }>(
      gate.ctx.db,
      "tasks",
      `${SHOP_VOICE}\nExtract the to-dos from the text below for a tailoring shop's task list. Today is ${today} (use it to turn "tomorrow", "Friday", "next week" into real dates). Answer as JSON: {"tasks": [{"title": short imperative sentence in English, "description": extra detail or "", "dueDate": "YYYY-MM-DD" or null}]}. Only real action items; at most 12; merge duplicates; do not invent deadlines.`,
      [{ text: body.data.text }],
      gate.ctx.email
    );
    const tasks = (out.tasks ?? [])
      .filter((t) => t.title?.trim())
      .slice(0, 12)
      .map((t) => ({ title: t.title!.trim().slice(0, 200), description: (t.description ?? "").trim().slice(0, 500), dueDate: t.dueDate && isRealDate(t.dueDate) && t.dueDate >= today ? t.dueDate : null }));
    return NextResponse.json({ tasks });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
