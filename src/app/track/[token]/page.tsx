import { notFound } from "next/navigation";
import { Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchPublicOrderStatus, parseHistoryLine, type PublicOrderStatusOrder } from "@/lib/public-order-status";
import { STAGE_META, normalizeIndianMobile, type Stage } from "@/lib/business-rules";
import { inr, fmtDate } from "@/lib/format";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";

/** Fulfillment stages only — "payment" is a financial state layered on top of "delivered",
 *  not a step in this timeline (mirrors how STAGE_META itself treats it). */
const TIMELINE_STAGES: Stage[] = ["received", "cutting", "stitching", "ready", "delivered"];

function timelineFor(order: PublicOrderStatusOrder) {
  const parsed = order.history.map(parseHistoryLine);
  const doneIdx = order.status === "payment" ? TIMELINE_STAGES.length - 1 : TIMELINE_STAGES.indexOf(order.status);
  return TIMELINE_STAGES.map((stage, i) => {
    const meta = STAGE_META[stage];
    // Last matching entry wins — a reworked order can revisit an earlier stage, and the most
    // recent pass through it is what a customer should see as "when this happened".
    const match = [...parsed].reverse().find((p) => p.label === meta.label);
    return { stage, meta, done: i <= doneIdx, when: match?.when || "" };
  });
}

export default async function CustomerOrderStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const data = await fetchPublicOrderStatus(supabase, token);
  if (!data) notFound();

  const { customerName, loyaltyPoints, measurements, orders, shopName, shopPhone } = data;
  const measurementEntries = Object.entries(measurements).filter(([, v]) => typeof v === "string" && v.trim() !== "");
  const waHref = shopPhone ? `https://wa.me/91${normalizeIndianMobile(shopPhone)}` : "";

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 py-8 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">{shopName || "Order Status"}</h1>
        <p className="text-sm text-muted-foreground">Dear {customerName || "Customer"}, here&apos;s where your order{orders.length > 1 ? "s" : ""} stand.</p>
      </div>

      {loyaltyPoints > 0 && (
        <div className="rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
          <span className="font-medium">🎁 {loyaltyPoints} loyalty points</span> <span className="text-muted-foreground">available on your next order</span>
        </div>
      )}

      {orders.length === 0 && <p className="text-sm text-muted-foreground">No orders found for this link.</p>}

      {orders.map((order) => (
        <div key={order.id} className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Order {order.id}</p>
              <p className="text-xs text-muted-foreground">
                Expected delivery: <span className="font-medium text-emerald-600 dark:text-emerald-400">{fmtDate(order.deliveryDate)}</span>
              </p>
            </div>
            <span
              className="rounded-full border px-2.5 py-1 text-xs font-medium"
              style={{ color: STAGE_META[order.status].color, background: STAGE_META[order.status].bg, borderColor: STAGE_META[order.status].border }}
            >
              {STAGE_META[order.status].emoji} {STAGE_META[order.status].label}
            </span>
          </div>

          {order.reworkFlag && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              A small adjustment is being made to this order{order.reworkReason ? `: ${order.reworkReason}` : "."}
            </p>
          )}

          <div className="flex flex-wrap gap-x-1 gap-y-2">
            {timelineFor(order).map(({ stage, meta, done, when }, i) => (
              <div key={stage} className="flex items-center">
                <div className={`flex flex-col items-center gap-1 ${done ? "" : "opacity-40"}`}>
                  <span className="text-lg leading-none">{meta.emoji}</span>
                  <span className="text-[11px] font-medium">{meta.label}</span>
                  <span className="text-[10px] text-muted-foreground">{when || "—"}</span>
                </div>
                {i < TIMELINE_STAGES.length - 1 && <span className="mx-1.5 mb-4 text-muted-foreground/40">→</span>}
              </div>
            ))}
          </div>

          {order.garments.length > 0 && (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Garment</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {order.garments.map((g, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{g.type}</td>
                      <td className="p-2 text-right tabular-nums">{g.no ?? 1}</td>
                      <td className="p-2 text-right tabular-nums">{g.amount != null ? inr(g.amount) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {order.images.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {order.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- external order-photo URL, not an optimizable remote image
                <img key={i} src={src} alt={`Order photo ${i + 1}`} className="aspect-square rounded-lg border object-cover" />
              ))}
            </div>
          )}

          {order.special && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Special instructions</p>
              <p className="mt-1 whitespace-pre-line text-sm">{order.special}</p>
            </div>
          )}

          <div className="flex justify-between border-t pt-3 text-sm font-semibold">
            <span>Balance due</span>
            <span className="tabular-nums">{inr(order.balance)}</span>
          </div>
        </div>
      ))}

      {measurementEntries.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-semibold">Your saved measurements</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {measurementEntries.map(([key, value]) => (
              <div key={key} className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
                <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, " ")}</p>
                <p className="text-sm font-semibold tabular-nums">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        {waHref && <WhatsAppButton href={waHref} label="Message us" />}
        {shopPhone && (
          <a href={`tel:${shopPhone}`} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            <Phone className="size-4" /> Call {shopName || "us"}
          </a>
        )}
      </div>

      <p className="pt-2 text-center text-xs text-muted-foreground">{shopName || "Your Boutique"}</p>
    </div>
  );
}
