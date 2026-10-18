import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getServerUser } from "@/lib/auth-server";
import { aiErrorResponse, aiJson, SHOP_VOICE } from "@/lib/ai-assist";
import { istDateString } from "@/lib/ist-date";
import { aggregateAmounts, aggregateOrders, cleanNumbersSpec, describeAnswer } from "@/lib/numbers-query";
import { isRestrictedRole } from "@/lib/permissions";
import { fetchAll } from "@/lib/targets-server";
import { createServiceClient } from "@/lib/supabase/service";

const bodySchema = z.object({ question: z.string().trim().min(5).max(200) });

/**
 * POST — "How much did we earn from blouses last month?". The AI turns the question into a structured query (metric, dates,
 * grouping); the totals are then summed from the shop's own records here, so no figure is ever the AI's guess. Needs View Reports.
 */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (isRestrictedRole(user.role) || !user.perms.viewReports) return NextResponse.json({ error: "You need permission to view reports to ask about the numbers" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type a question, like “how much did we earn from blouses last month?”" }, { status: 400 });
  const db: SupabaseClient<Database> | null = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured" }, { status: 501 });
  const today = istDateString();

  try {
    const raw = await aiJson<Record<string, unknown>>(
      db,
      "numbers",
      `${SHOP_VOICE}\nYou turn a boutique owner's question about their numbers into a structured query. Today is ${today} (financial year starts 1 April). Answer as JSON: {"metric": "revenue" (sales billed on stitching orders) | "orders" (number of orders or garments) | "collected" (money received from customers) | "expenses" | "outstanding" (money customers still owe), "groupBy": "none" | "month" | "garment" | "customer" | "category" (category only for expenses), "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "garment": optional garment name like "blouse", "customer": optional customer name}. Work out the dates from phrases like "last month" or "this year". If the question cannot be answered with these (profit, forecasts, anything else), answer {"unsupported": "one short sentence saying what you can answer instead"}.`,
      [{ text: parsed.data.question }],
      user.email
    );
    const cleaned = cleanNumbersSpec(raw, today);
    if ("error" in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 422 });
    const spec = cleaned.spec;

    let answer;
    if (spec.metric === "collected") {
      const rows = await fetchAll((a, b) => db.from("order_payments").select("amount, created_at").gte("created_at", `${spec.from}T00:00:00+05:30`).lte("created_at", `${spec.to}T23:59:59+05:30`).order("created_at").range(a, b));
      answer = aggregateAmounts(rows.map((r) => ({ date: istDateString(new Date(r.created_at)), amount: Number(r.amount) || 0 })), spec);
    } else if (spec.metric === "expenses") {
      const rows = await fetchAll((a, b) => db.from("expenses").select("date, amount, category").gte("date", spec.from).lte("date", spec.to).order("date").range(a, b));
      answer = aggregateAmounts(rows.map((r) => ({ date: r.date, amount: Number(r.amount) || 0, category: r.category })), spec);
    } else {
      const rows = await fetchAll((a, b) => db.from("orders").select("name, in_date, total, balance, garments").gte("in_date", spec.from).lte("in_date", spec.to).order("id").range(a, b));
      answer = aggregateOrders(rows, spec);
    }
    return NextResponse.json({ ...describeAnswer(answer, spec), spec });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
