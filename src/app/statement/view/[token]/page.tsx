import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPublicCustomerStatement } from "@/lib/public-customer-statement";
import { inr, fmtDate } from "@/lib/format";
import { Scissors } from "lucide-react";

const TYPE_LABEL: Record<"stitching" | "retail", string> = {
  stitching: "Stitching Order",
  retail: "Product Sale",
};

/** Public, unauthenticated statement view — reached only via the customer's own share_token
 *  (sent to them over WhatsApp). Mirrors the internal statement's read-only presentation
 *  (src/app/(app)/crm/[mobile]/statement/page.tsx) but with no internal links or filters —
 *  same trust model as /track/[token] and /invoice/view/[token]. */
export default async function PublicCustomerStatementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const data = await fetchPublicCustomerStatement(supabase, token);
  if (!data) notFound();

  const { customerName, customerMobile, transactions, shopName, shopPhone, shopLogoDataUrl } = data;

  const totalBilled = transactions.reduce((s, t) => s + t.billed, 0);
  const totalPaid = transactions.reduce((s, t) => s + t.paid, 0);
  const stitchBalance = transactions.filter((t) => t.type === "stitching").reduce((s, t) => s + t.balance, 0);
  const retailBalance = transactions.filter((t) => t.type === "retail").reduce((s, t) => s + t.balance, 0);
  const totalBalance = stitchBalance + retailBalance;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 py-8 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          {shopLogoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image
            <img src={shopLogoDataUrl} alt={shopName || "Company logo"} className="size-12 rounded-lg border bg-white object-contain" />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Scissors className="size-5" />
            </div>
          )}
          <div>
            <p className="font-semibold">{shopName || "Company"}</p>
            {shopPhone && <p className="text-xs text-muted-foreground">{shopPhone}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tracking-tight">Customer Statement</p>
          <p className="text-xs text-muted-foreground">Generated {fmtDate(new Date().toISOString())}</p>
        </div>
      </div>

      <div>
        <p className="font-medium">{customerName}</p>
        <p className="text-xs text-muted-foreground">{customerMobile} · All time</p>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-5">
        <div className="bg-card p-3 text-center">
          <p className="text-base font-semibold tabular-nums">{inr(totalBilled)}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Billed</p>
        </div>
        <div className="bg-card p-3 text-center">
          <p className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{inr(totalPaid)}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Paid</p>
        </div>
        <div className="bg-card p-3 text-center">
          <p className="text-base font-semibold tabular-nums">{inr(stitchBalance)}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stitch Due</p>
        </div>
        <div className="bg-card p-3 text-center">
          <p className="text-base font-semibold tabular-nums">{inr(retailBalance)}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Product Sales Due</p>
        </div>
        <div className="col-span-2 bg-card p-3 text-center sm:col-span-1">
          <p className={`text-base font-semibold tabular-nums ${totalBalance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {inr(totalBalance)}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance Due</p>
        </div>
      </div>

      {transactions.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No transactions yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">Date</th>
                <th className="py-2 pr-2 font-medium">Type</th>
                <th className="py-2 pr-2 font-medium">Reference</th>
                <th className="py-2 pr-2 font-medium">Description</th>
                <th className="py-2 pr-2 text-right font-medium">Billed</th>
                <th className="py-2 pr-2 text-right font-medium">Paid</th>
                <th className="py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{TYPE_LABEL[t.type]}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{t.reference}</td>
                  <td className="max-w-40 truncate py-2 pr-2 text-muted-foreground">{t.description}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{inr(t.billed)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{t.paid > 0 ? inr(t.paid) : "—"}</td>
                  <td className={`py-2 text-right font-medium tabular-nums ${t.balance > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{inr(t.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="pt-4 text-center text-xs text-muted-foreground">{shopName || "Your Company"} · Generated from Fashion Flow</p>
    </div>
  );
}
