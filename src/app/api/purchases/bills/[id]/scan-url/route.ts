import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { createServiceClient } from "@/lib/supabase/service";
import { BILL_SCAN_BUCKET } from "@/lib/purchase-bill-scan";

const SIGNED_URL_SECONDS = 60 * 10;

/** A short-lived signed link to the original PDF/photo a bill was scanned from — the bucket is
 *  private, so the bill detail page's "View original scan" button comes through here. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Server is not configured — SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 501 });

  const { data: bill } = await db.from("purchase_bills").select("scan_path").eq("id", id).maybeSingle();
  if (!bill?.scan_path) return NextResponse.json({ error: "No scan attached to this bill" }, { status: 404 });

  const { data, error } = await db.storage.from(BILL_SCAN_BUCKET).createSignedUrl(bill.scan_path, SIGNED_URL_SECONDS);
  if (error || !data) return NextResponse.json({ error: "Couldn't open the original scan" }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
