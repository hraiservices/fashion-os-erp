import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth-server";
import { logAction } from "@/lib/logging";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to delete payroll runs" }, { status: 403 });

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("status, period_start, period_end")
    .eq("id", id)
    .maybeSingle();

  if (run?.status === "finalized") {
    return NextResponse.json({ error: "Finalized payroll runs cannot be deleted." }, { status: 409 });
  }

  // Cascades to payslips (FK ON DELETE CASCADE), which un-links advances (ON DELETE SET NULL).
  const { error } = await supabase.from("payroll_runs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(supabase, user.email, `Payroll run deleted: ${run?.period_start ?? id} – ${run?.period_end ?? ""}`);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.perms.managePayroll) return NextResponse.json({ error: "No permission to finalize payroll runs" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { action } = body as { action?: string };

  if (action === "finalize") {
    const { error } = await supabase
      .from("payroll_runs")
      .update({ status: "finalized", finalized_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAction(supabase, user.email, `Payroll run finalized: ${id}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
