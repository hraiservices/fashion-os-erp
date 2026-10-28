import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapExpenseRow } from "@/lib/types";
import { logAction } from "@/lib/logging";
import { uploadExpenseReceipt, signExpenseReceiptUrl } from "@/lib/supabase/expense-receipt-storage";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().min(1),
  description: z.string().optional().default(""),
  amount: z.number().positive(),
  payMethod: z.string().min(1),
  customerMobile: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  employeeId: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  vendorName: z.string().optional().nullable(),
  /** A new receipt photo to upload, as a base64 image data: URL — omitted when not adding one. */
  receiptDataUrl: z.string().optional(),
});

export async function GET() {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.perms.manageExpenses) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data, error } = await db
    .from("expenses")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const expenses = await Promise.all(
    (data || []).map(async (row) => {
      const mapped = mapExpenseRow(row);
      if (mapped.receiptPath) mapped.receiptUrl = await signExpenseReceiptUrl(db, mapped.receiptPath);
      return mapped;
    })
  );
  return NextResponse.json({ expenses });
}

export async function POST(req: Request) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.perms.manageExpenses) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const fd = parsed.data;
  const { data, error } = await db
    .from("expenses")
    .insert({
      date: fd.date,
      category: fd.category,
      description: fd.description,
      amount: fd.amount,
      pay_method: fd.payMethod,
      customer_mobile: fd.customerMobile || null,
      customer_name: fd.customerName || null,
      employee_id: fd.employeeId || null,
      reference_number: fd.referenceNumber || null,
      vendor_name: fd.vendorName || null,
      created_by: user.email,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let expense = mapExpenseRow(data);

  if (fd.receiptDataUrl) {
    const path = await uploadExpenseReceipt(db, expense.id, fd.receiptDataUrl);
    const { data: updated, error: updateError } = await db.from("expenses").update({ receipt_path: path }).eq("id", expense.id).select().single();
    if (!updateError && updated) {
      expense = mapExpenseRow(updated);
      expense.receiptUrl = await signExpenseReceiptUrl(db, path);
    }
  }

  await logAction(supabase, user.email, `Expense added: ${fd.category}`);
  return NextResponse.json({ expense }, { status: 201 });
}