import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { extractMeasurementsFromImage } from "@/lib/chatbot/gemini";

const bodySchema = z.object({
  imageDataUrl: z.string().min(1),
  fields: z.array(z.string()).min(1).max(60),
});

/** Reads a photo of a paper measurement chart and returns the values it could find, for the
 *  order form's "Scan chart" button to merge into the measurement grid. No dedicated
 *  permission beyond being signed in — same access level as creating/editing an order itself. */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  try {
    const values = await extractMeasurementsFromImage(parsed.data.imageDataUrl, parsed.data.fields);
    return NextResponse.json({ values });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read the chart" }, { status: 500 });
  }
}
