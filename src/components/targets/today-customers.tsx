"use client";

import { useState } from "react";
import { Cake, ChevronDown, MessageCircle, Star } from "lucide-react";
import { useReviewCandidates, useUpcomingOccasions } from "@/hooks/use-customer-nudges";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { cn } from "@/lib/utils";

const wa = (mobile: string, text: string) => `https://wa.me/91${normalizeIndianMobile(mobile)}?text=${encodeURIComponent(text)}`;
const first = (name: string) => name.trim().split(/\s+/)[0] || "there";

function Collapsible({ icon: Icon, title, tone, children }: { icon: typeof Cake; title: string; tone: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={cn("space-y-2 rounded-xl border p-3", tone)}>
      <button type="button" onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon className="size-4 shrink-0" /> {title}
        </span>
        <ChevronDown className={cn("size-4 shrink-0", open && "rotate-180")} />
      </button>
      {open && <ul className="space-y-1">{children}</ul>}
    </section>
  );
}

const Row = ({ name, sub, href, label, onSent }: { name: string; sub: string; href: string; label: string; onSent?: () => void }) => (
  <li className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 text-sm text-foreground">
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium">{name}</span>
      <span className="block text-xs text-muted-foreground">{sub}</span>
    </span>
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onSent} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white" aria-label={label}>
      <MessageCircle className="size-4" />
    </a>
  </li>
);

/** Birthdays and anniversaries this week, each with a one-tap greeting. */
export function OccasionsCard({ today, canEdit }: { today: string; canEdit: boolean }) {
  const { data = [] } = useUpcomingOccasions(today, canEdit);
  const { data: shop } = useShopSettings();
  if (!canEdit || data.length === 0) return null;
  const sn = shop?.name || "our boutique";
  const greeting = (o: (typeof data)[number]) =>
    o.kind === "birthday"
      ? `Happy Birthday ${first(o.name)}! 🎂 Wishing you a wonderful year ahead, from all of us at ${sn}. Treat yourself to a new outfit — we'd love to stitch it for you!`
      : `Happy Anniversary ${first(o.name)}! 💐 Wishing you both many happy years together, from all of us at ${sn}. We'd love to dress you for the celebration!`;
  return (
    <Collapsible icon={Cake} title={`${data.length} birthday${data.length === 1 ? "" : "s"} / anniversar${data.length === 1 ? "y" : "ies"} this week`} tone="border-pink-200 bg-pink-50/60 text-pink-800 dark:border-pink-500/30 dark:bg-pink-500/5 dark:text-pink-300">
      {data.map((o, i) => (
        <Row key={`${o.mobile}-${o.kind}-${i}`} name={o.name} sub={`${o.kind === "birthday" ? "Birthday" : "Anniversary"} · ${o.daysAway === 0 ? "today" : o.daysAway === 1 ? "tomorrow" : `in ${o.daysAway} days`} (${o.label})`} href={wa(o.mobile, greeting(o))} label={`Greet ${o.name} on WhatsApp`} />
      ))}
    </Collapsible>
  );
}

/** Recently delivered orders: ask happy customers for a Google review. Only shows once a review link is set in Shop Profile. */
export function ReviewRequestCard({ today, canEdit }: { today: string; canEdit: boolean }) {
  const { data: shop } = useShopSettings();
  const link = shop?.reviewUrl?.trim() ?? "";
  const { data = [] } = useReviewCandidates(today, canEdit && !!link);
  const [asked, setAsked] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("review-asked") || "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const rows = data.filter((r) => !asked.has(r.id));
  if (!canEdit || !link || rows.length === 0) return null;
  const mark = (id: string) => {
    const next = new Set(asked).add(id);
    setAsked(next);
    try {
      localStorage.setItem("review-asked", JSON.stringify([...next].slice(-300)));
    } catch {
      /* private mode — it just reappears next time */
    }
  };
  const msg = (name: string) => `Hi ${first(name)}! Thank you for choosing ${shop?.name || "us"} 🙏 If you loved your outfit, a quick Google review means a lot to a small business like ours: ${link}`;
  return (
    <Collapsible icon={Star} title={`${rows.length} recent ${rows.length === 1 ? "customer" : "customers"} to ask for a review`} tone="border-yellow-200 bg-yellow-50/60 text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/5 dark:text-yellow-300">
      {rows.slice(0, 12).map((r) => (
        <Row key={r.id} name={r.name} sub={`Delivered ${r.deliveryDate}`} href={wa(r.mobile, msg(r.name))} label={`Ask ${r.name} for a review`} onSent={() => mark(r.id)} />
      ))}
    </Collapsible>
  );
}
