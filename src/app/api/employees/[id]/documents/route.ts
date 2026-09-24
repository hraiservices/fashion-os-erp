import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadEmployeeDocument, signEmployeeDocumentUrl, deleteEmployeeDocument } from "@/lib/supabase/employee-document-storage";
import { logAction } from "@/lib/logging";

/**
 * Employee KYC/documents — Aadhaar/PAN numbers + images, and the four single-file letter slots
 * (offer/relieving/resignation/experience). Deliberately gated on the literal role "admin", not
 * a permission flag: managePayroll (salary) can be granted to a Manager via custom_permissions,
 * but this data is meant to stay stricter than that no matter how permissions are customized.
 * The repeatable payslip-copy / other-document lists live in employee_documents, handled by the
 * sibling documents/list route.
 */
function requireAdmin() {
  return getServerUser().then(({ supabase, user }) => {
    if (!user) return { supabase, user: null, error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
    if (user.role !== "admin") return { supabase, user: null, error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
    return { supabase, user, error: null };
  });
}

const SLOTS = ["offer", "relieving", "resignation", "experience"] as const;
type Slot = (typeof SLOTS)[number];
const SLOT_COLUMN: Record<Slot, "offer_letter_path" | "relieving_letter_path" | "resignation_letter_path" | "experience_letter_path"> = {
  offer: "offer_letter_path",
  relieving: "relieving_letter_path",
  resignation: "resignation_letter_path",
  experience: "experience_letter_path",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAdmin();
  if (error) return error;

  const serviceClient = createServiceClient();
  if (!serviceClient) return NextResponse.json({ error: "Server is not configured (missing service role key)" }, { status: 501 });

  const [{ data: employee }, { data: docs }] = await Promise.all([
    serviceClient
      .from("employees")
      .select("aadhaar_number, aadhaar_image_path, pan_number, pan_image_path, offer_letter_path, relieving_letter_path, resignation_letter_path, experience_letter_path")
      .eq("id", id)
      .maybeSingle(),
    serviceClient.from("employee_documents").select("id, category, label, storage_path, created_at").eq("employee_id", id).order("created_at", { ascending: false }),
  ]);
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const [aadhaarImageUrl, panImageUrl, offerLetterUrl, relievingLetterUrl, resignationLetterUrl, experienceLetterUrl] = await Promise.all([
    signEmployeeDocumentUrl(serviceClient, employee.aadhaar_image_path),
    signEmployeeDocumentUrl(serviceClient, employee.pan_image_path),
    signEmployeeDocumentUrl(serviceClient, employee.offer_letter_path),
    signEmployeeDocumentUrl(serviceClient, employee.relieving_letter_path),
    signEmployeeDocumentUrl(serviceClient, employee.resignation_letter_path),
    signEmployeeDocumentUrl(serviceClient, employee.experience_letter_path),
  ]);

  const rows = docs || [];
  const withUrls = await Promise.all(
    rows.map(async (d) => ({ id: d.id, category: d.category, label: d.label, createdAt: d.created_at, url: await signEmployeeDocumentUrl(serviceClient, d.storage_path) }))
  );

  return NextResponse.json({
    aadhaarNumber: employee.aadhaar_number,
    aadhaarImageUrl,
    panNumber: employee.pan_number,
    panImageUrl,
    offerLetterUrl,
    relievingLetterUrl,
    resignationLetterUrl,
    experienceLetterUrl,
    payslips: withUrls.filter((d) => d.category === "payslip"),
    otherDocuments: withUrls.filter((d) => d.category === "other"),
  });
}

const kycSchema = z.object({
  action: z.literal("kyc"),
  aadhaarNumber: z.string().optional(),
  panNumber: z.string().optional(),
  aadhaarImage: z.string().optional(),
  panImage: z.string().optional(),
});
const singleSchema = z.object({ action: z.literal("single"), slot: z.enum(SLOTS), file: z.string().min(1) });
const postSchema = z.discriminatedUnion("action", [kycSchema, singleSchema]);

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

  if (parsed.data.action === "kyc") {
    const update: {
      aadhaar_number?: string | null;
      pan_number?: string | null;
      aadhaar_image_path?: string;
      pan_image_path?: string;
    } = {};
    if (parsed.data.aadhaarNumber !== undefined) update.aadhaar_number = parsed.data.aadhaarNumber.trim() || null;
    if (parsed.data.panNumber !== undefined) update.pan_number = parsed.data.panNumber.trim().toUpperCase() || null;
    if (parsed.data.aadhaarImage) update.aadhaar_image_path = await uploadEmployeeDocument(serviceClient, id, parsed.data.aadhaarImage);
    if (parsed.data.panImage) update.pan_image_path = await uploadEmployeeDocument(serviceClient, id, parsed.data.panImage);
    if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

    const { error: updateError } = await serviceClient.from("employees").update(update).eq("id", id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    await logAction(supabase, user!.email, `KYC details updated for ${employee.name}`);
    return NextResponse.json({ ok: true });
  }

  // action === "single" — one of the four letter slots, replacing any previous file. The update
  // is a switch (not a computed { [column]: ... }) so each branch's object literal matches the
  // employees Update type exactly, same reasoning as the kyc branch above.
  const column = SLOT_COLUMN[parsed.data.slot];
  const { data: current } = await serviceClient.from("employees").select(column).eq("id", id).maybeSingle();
  const newPath = await uploadEmployeeDocument(serviceClient, id, parsed.data.file);
  const { error: updateError } = await (() => {
    switch (column) {
      case "offer_letter_path":
        return serviceClient.from("employees").update({ offer_letter_path: newPath }).eq("id", id);
      case "relieving_letter_path":
        return serviceClient.from("employees").update({ relieving_letter_path: newPath }).eq("id", id);
      case "resignation_letter_path":
        return serviceClient.from("employees").update({ resignation_letter_path: newPath }).eq("id", id);
      case "experience_letter_path":
        return serviceClient.from("employees").update({ experience_letter_path: newPath }).eq("id", id);
    }
  })();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (current) await deleteEmployeeDocument(serviceClient, (current as Record<string, string | null>)[column]);
  await logAction(supabase, user!.email, `${parsed.data.slot} letter uploaded for ${employee.name}`);
  return NextResponse.json({ ok: true });
}
