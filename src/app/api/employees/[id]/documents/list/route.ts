import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadEmployeeDocument, deleteEmployeeDocument } from "@/lib/supabase/employee-document-storage";
import { logAction } from "@/lib/logging";

/** Open-ended document lists for one employee — signed payslip copies and "other" documents.
 *  Same admin-only gate as the sibling documents route (literal role check, not a permission
 *  flag). Each entry is one file plus a label; unlike the four single-file letter slots, any
 *  number of these can exist at once. */
async function requireAdmin() {
  const { supabase, user } = await getServerUser();
  if (!user) return { supabase, user: null, error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  if (user.role !== "admin") return { supabase, user: null, error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  return { supabase, user, error: null };
}

const postSchema = z.object({ category: z.enum(["payslip", "other"]), label: z.string().optional(), file: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, error } = await requireAdmin();
  if (error) return error;

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured (missing service role key)" }, { status: 501 });

  const { data: employee } = await serviceClient.from("employees").select("id, name").eq("id", id).maybeSingle();
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const path = await uploadEmployeeDocument(serviceClient, id, parsed.data.file);
  const { error: insertError } = await serviceClient
    .from("employee_documents")
    .insert({ employee_id: id, category: parsed.data.category, label: parsed.data.label?.trim() || "", storage_path: path, uploaded_by: user!.email });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await logAction(supabase, user!.email, `${parsed.data.category === "payslip" ? "Payslip copy" : "Document"} added for ${employee.name}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAdmin();
  if (error) return error;

  const docId = new URL(request.url).searchParams.get("docId");
  if (!docId) return NextResponse.json({ error: "docId is required" }, { status: 400 });

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured (missing service role key)" }, { status: 501 });

  const { data: doc } = await serviceClient.from("employee_documents").select("id, employee_id, storage_path").eq("id", docId).maybeSingle();
  if (!doc || doc.employee_id !== id) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { error: deleteError } = await serviceClient.from("employee_documents").delete().eq("id", docId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  await deleteEmployeeDocument(serviceClient, doc.storage_path);

  return NextResponse.json({ ok: true });
}
