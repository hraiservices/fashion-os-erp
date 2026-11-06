import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { aiJson, aiErrorResponse } from "@/lib/ai-assist";
import { istDateString } from "@/lib/ist-date";
import { BILL_SCAN_BUCKET, BILL_SCAN_MAX_BYTES, isBillScanContentType, safeScanFileName } from "@/lib/purchase-bill-scan";

const bodySchema = z.object({
  base64: z.string().min(1),
  contentType: z.string().min(1),
  fileName: z.string().min(1).default("bill"),
});

interface ExtractedItem {
  description: string;
  qty: number;
  unitCost: number;
}

interface ExtractedBill {
  vendorName: string;
  billDate: string | null;
  dueDate: string | null;
  referenceNumber: string;
  items: ExtractedItem[];
  gstType: "none" | "intra" | "inter";
  taxRate: number;
  shippingCharges: number;
  otherCharges: number;
  notes: string;
}

const SYSTEM_PROMPT = `You read a photo or PDF of a vendor purchase bill (an invoice a tailoring/fashion business received from a fabric, trim, or finished-goods supplier) and extract it as JSON, nothing else.

Return EXACTLY this shape:
{
  "vendorName": string (the SUPPLIER's name printed on the bill, not the buyer),
  "billDate": string or null (YYYY-MM-DD),
  "dueDate": string or null (YYYY-MM-DD — only if a due/payment date is printed),
  "referenceNumber": string (the vendor's own invoice/bill number as printed — empty string if none is legible),
  "items": [ { "description": string, "qty": number, "unitCost": number } ... ] (every line item; qty and unitCost as plain numbers, no currency symbols or commas; skip subtotal/tax/total rows themselves),
  "gstType": "none" | "intra" | "inter" ("intra" if CGST+SGST are shown, "inter" if IGST is shown, "none" if no tax is shown),
  "taxRate": number (the GST percentage rate, e.g. 5, 12, 18 — 0 if gstType is "none"),
  "shippingCharges": number (0 if not shown separately),
  "otherCharges": number (any other charge line that isn't shipping or a line item — packing, loading, etc. — 0 if none),
  "notes": string (anything worth flagging that doesn't fit the fields above — empty string if nothing)
}

Only use what's actually printed on the bill. Never invent a vendor name, number, or amount — if something truly isn't legible, use null (for dates) or an empty string / 0 as appropriate for that field's type. Output ONLY the JSON object.`;

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function bestMatch<T extends { name: string }>(query: string, candidates: T[]): T | null {
  const q = normalize(query);
  if (!q || candidates.length === 0) return null;
  const exact = candidates.find((c) => normalize(c.name) === q);
  if (exact) return exact;
  const contains = candidates.find((c) => {
    const n = normalize(c.name);
    return n.length > 2 && (n.includes(q) || q.includes(n));
  });
  if (contains) return contains;
  const qWords = new Set(q.split(" ").filter((w) => w.length > 2));
  if (qWords.size === 0) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const cWords = new Set(normalize(c.name).split(" ").filter((w) => w.length > 2));
    if (cWords.size === 0) continue;
    const overlap = [...qWords].filter((w) => cWords.has(w)).length;
    const score = overlap / Math.max(qWords.size, cWords.size);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Upload a bill scan (PDF/photo) and have AI pre-fill the New Bill form from it — see
 *  add_purchase_bill_scans.sql and BillScanUpload. Nothing is saved as a bill here; the draft
 *  comes back for staff to review/edit, same as every other AI suggestion in this app. */
export async function POST(request: Request) {
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePurchases) return NextResponse.json({ error: "No permission to manage bills" }, { status: 403 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { base64, contentType, fileName } = parsed.data;

  if (!isBillScanContentType(contentType)) return NextResponse.json({ error: "Only images and PDFs are supported" }, { status: 400 });

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return NextResponse.json({ error: "That file couldn't be read" }, { status: 400 });
  }
  if (bytes.length === 0) return NextResponse.json({ error: "That file is empty" }, { status: 400 });
  if (bytes.length > BILL_SCAN_MAX_BYTES) return NextResponse.json({ error: `That file is over ${Math.round(BILL_SCAN_MAX_BYTES / 1024 / 1024)} MB — try a smaller photo or a compressed PDF` }, { status: 400 });

  try {
    const [vendorsRes, materialsRes, unitsRes, productsRes, extracted] = await Promise.all([
      db.from("vendors").select("id, name"),
      db.from("raw_materials").select("id, name, unit_id"),
      db.from("units_of_measure").select("id, name"),
      db.from("products").select("id, name, cost_price"),
      aiJson<ExtractedBill>(db, "billscan", SYSTEM_PROMPT, [{ inlineData: { mimeType: contentType, data: base64 } }], user.email),
    ]);

    const vendors = vendorsRes.data || [];
    const unitNameById = new Map((unitsRes.data || []).map((u) => [u.id, u.name]));
    const materials = (materialsRes.data || []).map((m) => ({ id: m.id, name: m.name, itemType: "raw_material" as const, unitName: unitNameById.get(m.unit_id) || "" }));
    const products = (productsRes.data || []).map((p) => ({ id: p.id, name: p.name, itemType: "product" as const, unitName: "pcs", costPrice: p.cost_price }));
    const catalog = [...materials, ...products];

    const vendorMatch = bestMatch(extracted.vendorName || "", vendors);
    const items = (Array.isArray(extracted.items) ? extracted.items : []).slice(0, 100).map((it) => {
      const match = bestMatch(it.description || "", catalog);
      return {
        description: String(it.description || "").slice(0, 200),
        qty: Number.isFinite(it.qty) ? Math.max(0, it.qty) : 0,
        unitCost: Number.isFinite(it.unitCost) ? Math.max(0, it.unitCost) : 0,
        itemType: match?.itemType ?? null,
        itemId: match?.id ?? null,
        itemName: match?.name ?? null,
        unitName: match?.unitName ?? "",
      };
    });

    const path = `scans/${safeScanFileName(fileName)}`;
    const { error: uploadError } = await db.storage.from(BILL_SCAN_BUCKET).upload(path, bytes, { contentType, upsert: false });
    if (uploadError) return NextResponse.json({ error: `Extracted the bill, but couldn't save the original file: ${uploadError.message}` }, { status: 500 });

    return NextResponse.json({
      scanPath: path,
      scanContentType: contentType,
      draft: {
        vendorId: vendorMatch?.id ?? null,
        vendorName: extracted.vendorName || "",
        billDate: extracted.billDate || istDateString(),
        dueDate: extracted.dueDate || null,
        referenceNumber: extracted.referenceNumber || "",
        items,
        gstType: ["none", "intra", "inter"].includes(extracted.gstType) ? extracted.gstType : "none",
        taxRate: Number.isFinite(extracted.taxRate) ? Math.max(0, extracted.taxRate) : 0,
        shippingCharges: Number.isFinite(extracted.shippingCharges) ? Math.max(0, extracted.shippingCharges) : 0,
        otherCharges: Number.isFinite(extracted.otherCharges) ? Math.max(0, extracted.otherCharges) : 0,
        notes: extracted.notes || "",
      },
    });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
