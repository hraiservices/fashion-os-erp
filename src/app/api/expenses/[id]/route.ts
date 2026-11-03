import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapExpenseRow } from "@/lib/types";
import { logAction } from "@/lib/logging";
import { uploadExpenseReceipt, signExpenseReceiptUrl, deleteExpenseReceipt } from "@/lib/supabase/expense-receipt-storage";

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
  /** A new receipt photo to upload (base64 data: URL), replacing any existing one. Omitted to
   *  leave the current receipt untouched. */
  receiptDataUrl: z.string().optional(),
  /** True to remove the current receipt without replacing it. */
  removeReceipt: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.perms.manageExpenses) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const fd = parsed.data;

  // Resolve the receipt column update first — a new upload replaces (and deletes) any existing
  // file, an explicit removal clears the column and deletes the file, and leaving both unset
  // means the column simply isn't included in the update below (untouched).
  const { data: existingRow } = await db.from("expenses").select("receipt_path").eq("id", id).maybeSingle();
  const existingReceiptPath = existingRow?.receipt_path ?? null;
  let receiptPathUpdate: { receipt_path: string | null } | Record<string, never> = {};
  if (fd.receiptDataUrl) {
    const newPath = await uploadExpenseReceipt(db, id, fd.receiptDataUrl);
    if (existingReceiptPath) await deleteExpenseReceipt(db, existingReceiptPath);
    receiptPathUpdate = { receipt_path: newPath };
  } else if (fd.removeReceipt && existingReceiptPath) {
    await deleteExpenseReceipt(db, existingReceiptPath);
    receiptPathUpdate = { receipt_path: null };
  }

  const { data, error } = await db
    .from("expenses")
    .update({
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
      ...receiptPathUpdate,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const expense = mapExpenseRow(data);
  if (expense.receiptPath) expense.receiptUrl = await signExpenseReceiptUrl(db, expense.receiptPath);
  await logAction(supabase, user.email, `Expense updated: ${fd.category}`);
  return NextResponse.json({ expense });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.perms.manageExpenses) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { id } = await params;
  // Fetched before deleting purely so the audit-trail entry below records what was actually
  // lost — expenses aren't summed into any cached/derived balance, so there's nothing to
  // reverse, but "Expense deleted" with no amount or category made the activity log useless
  // for reconstructing what happened after the fact.
  const { data: row } = await db.from("expenses").select("category, amount, receipt_path").eq("id", id).maybeSingle();
  const { error } = await db.from("expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (row?.receipt_path) await deleteExpenseReceipt(db, row.receipt_path);

  await logAction(supabase, user.email, `🗑️ Expense deleted: ${row?.category || id}${row ? ` — ₹${row.amount}` : ""}`);
  return NextResponse.json({ ok: true });
}
