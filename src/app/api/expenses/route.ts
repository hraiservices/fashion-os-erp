import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { isRestrictedRole } from "@/lib/permissions";
import { mapExpenseRow } from "@/lib/types";
import { logAction } from "@/lib/logging";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().min(1),
  description: z.string().optional().default(""),
  amount: z.number().positive(),
  payMethod: z.string().min(1),
  customerMobile: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
});

export async function GET() {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isRestrictedRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expenses: (data || []).map(mapExpenseRow) });
}

export async function POST(req: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isRestrictedRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const fd = parsed.data;
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      date: fd.date,
      category: fd.category,
      description: fd.description,
      amount: fd.amount,
      pay_method: fd.payMethod,
      customer_mobile: fd.customerMobile || null,
      customer_name: fd.customerName || null,
      created_by: user.email,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAction(supabase, user.email, `Expense added: ${fd.category}`);
  return NextResponse.json({ expense: mapExpenseRow(data) }, { status: 201 });
}