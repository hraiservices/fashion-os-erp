import { NextResponse } from "next/server";
import { istDateString } from "@/lib/ist-date";
import { serverError } from "@/lib/targets-api";
import { buildSummary, targetsContext } from "@/lib/targets-server";

/** GET — everything the Today screen and the dashboard cards show, scoped to this person (or to everyone for those who see all). */
export async function GET() {
  const gate = await targetsContext();
  if ("error" in gate) return gate.error;
  try {
    return NextResponse.json(await buildSummary(gate.ctx, istDateString()));
  } catch (e) {
    return serverError(e instanceof Error ? e.message : "Failed to load your day");
  }
}
