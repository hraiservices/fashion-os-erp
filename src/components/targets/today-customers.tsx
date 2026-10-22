"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Cake, ChevronDown, Gift, MessageCircle, Repeat, RotateCcw, Sparkles, Star } from "lucide-react";
import { useAiOn, useLeadAi, useReorderNudges, useThankYou, type LeadReply } from "@/hooks/use-ai";
import { useLeads, useTasks } from "@/hooks/use-targets";
import { TRIAL_TAG, mobileFromTrial, trialMessage } from "@/lib/trial";
import { addDaysIso } from "@/lib/work-tasks";
import { winBackCandidates, winBackMessage } from "@/lib/win-back";
import type { LeadDto } from "@/lib/targets-types";
import { useReferralCandidates, useReviewCandidates, useUpcomingOccasions } from "@/hooks/use-customer-nudges";
import { useShopSettings } from "@/hooks/use-shop-settings";
import { normalizeIndianMobile } from "@/lib/business-rules";
import { fillReorder } from "@/lib/reorder";
import { referralInviteMessage } from "@/lib/referral-nudge";
import { useAwardReviewBonus } from "@/hooks/use-customer-mutations";
import { useIssueReferralCoupon } from "@/hooks/use-referral-coupons";
import { Textarea } from "@/components/ui/textarea";
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

/** One recently delivered order: the plain review ask, or a personal thank-you written by AI (when switched on). */
function ReviewRow({ row, fallback, onSent }: { row: { id: string; name: string; mobile: string; deliveryDate: string }; fallback: string; onSent: () => void }) {
  const aiOn = useAiOn("thanks");
  const thanks = useThankYou();
  const [draft, setDraft] = useState<string | null>(null);
  const [rewarded, setRewarded] = useState(false);
  const bonus = useAwardReviewBonus();
  return (
    <>
      <Row name={row.name} sub={`Delivered ${row.deliveryDate}`} href={wa(row.mobile, draft ?? fallback)} label={`Ask ${row.name} for a review`} onSent={onSent} />
      <li className="-mt-0.5 flex flex-wrap items-center gap-3 pl-3">
        {aiOn && (
          <button
            type="button"
            disabled={thanks.isPending}
            onClick={() => thanks.mutate(row.id, { onSuccess: (r) => setDraft(r.text), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't write it") })}
            className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-violet-700 disabled:opacity-60 dark:text-violet-300"
          >
            <Sparkles className="size-3.5" /> {thanks.isPending ? "Writing…" : draft ? "Write another with AI" : "Personal thank-you with AI"}
          </button>
        )}
        <button
          type="button"
          disabled={rewarded || bonus.isPending}
          onClick={() =>
            bonus.mutate({ mobile: row.mobile, name: row.name }, {
              onSuccess: (r) => {
                setRewarded(true);
                toast.success(`+${r.pts} loyalty pts added for ${row.name}`);
              },
              onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't award points"),
            })
          }
          className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-emerald-700 disabled:opacity-60 dark:text-emerald-300"
        >
          <Gift className="size-3.5" /> {rewarded ? "Points awarded" : bonus.isPending ? "Awarding…" : "Got a review — award points"}
        </button>
      </li>
    </>
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
        <ReviewRow key={r.id} row={r} fallback={msg(r.name)} onSent={() => mark(r.id)} />
      ))}
    </Collapsible>
  );
}

/** One recently delivered customer: issue them a referral coupon and open WhatsApp with the invite pre-filled. */
function ReferralRow({ row, shopName, onSent }: { row: { id: string; name: string; mobile: string; deliveryDate: string }; shopName: string; onSent: () => void }) {
  const issue = useIssueReferralCoupon();
  const [href, setHref] = useState<string | null>(null);
  if (href) return <Row name={row.name} sub={`Delivered ${row.deliveryDate} · coupon ready`} href={href} label={`Invite ${row.name} to refer a friend`} onSent={onSent} />;
  return (
    <li className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 text-sm text-foreground">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{row.name}</span>
        <span className="block text-xs text-muted-foreground">Delivered {row.deliveryDate}</span>
      </span>
      <button
        type="button"
        disabled={issue.isPending}
        onClick={() =>
          issue.mutate(row.mobile, {
            onSuccess: (r) => setHref(wa(row.mobile, referralInviteMessage(row.name, r.coupon.code, r.coupon.discountAmount, shopName))),
            onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't issue a coupon"),
          })
        }
        className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white disabled:opacity-60"
      >
        <Gift className="size-3.5" /> {issue.isPending ? "Issuing…" : "Invite a friend"}
      </button>
    </li>
  );
}

/** Recently delivered orders: nudge happy customers to refer a friend, issuing a coupon on the spot. */
export function ReferralCard({ today, canEdit }: { today: string; canEdit: boolean }) {
  const { data: shop } = useShopSettings();
  const { data = [] } = useReferralCandidates(today, canEdit);
  const [asked, setAsked] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("referral-asked") || "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const rows = data.filter((r) => !asked.has(r.id));
  if (!canEdit || rows.length === 0) return null;
  const mark = (id: string) => {
    const next = new Set(asked).add(id);
    setAsked(next);
    try {
      localStorage.setItem("referral-asked", JSON.stringify([...next].slice(-300)));
    } catch {
      /* private mode — it just reappears next time */
    }
  };
  return (
    <Collapsible icon={Gift} title={`${rows.length} recent ${rows.length === 1 ? "customer" : "customers"} to invite for a referral`} tone="border-sky-200 bg-sky-50/60 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/5 dark:text-sky-300">
      {rows.slice(0, 12).map((r) => (
        <ReferralRow key={r.id} row={r} shopName={shop?.name || ""} onSent={() => mark(r.id)} />
      ))}
    </Collapsible>
  );
}

function WinBackRow({ lead, shopName }: { lead: LeadDto; shopName: string }) {
  const aiOn = useAiOn("reply");
  const ai = useLeadAi<LeadReply>(lead.id);
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? winBackMessage(lead.name, lead.lostReason, shopName);
  return (
    <>
      <Row name={lead.name} sub={`Said no: ${lead.lostReason} · ${lead.lostAt ? lead.lostAt.slice(0, 10) : ""}`} href={wa(lead.mobile, text)} label={`Message ${lead.name} on WhatsApp`} />
      {aiOn && (
        <li className="-mt-0.5 pl-3">
          <button
            type="button"
            disabled={ai.isPending}
            onClick={() => ai.mutate({ action: "reply", intent: `win back a lead who said no earlier (${lead.lostReason}); be warm, no pressure, mention nothing you don't know` }, { onSuccess: (r) => setDraft(r.text), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't write it") })}
            className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-violet-700 disabled:opacity-60 dark:text-violet-300"
          >
            <Sparkles className="size-3.5" /> {ai.isPending ? "Writing…" : draft ? "Write another with AI" : "Write it with AI instead"}
          </button>
        </li>
      )}
    </>
  );
}

/** Leads who said no 1–4 months ago for a reason that can change — a polite second message. */
export function WinBackCard({ today, canEdit }: { today: string; canEdit: boolean }) {
  const { data } = useLeads({ stage: "lost", limit: 300 }, { enabled: canEdit });
  const { data: shop } = useShopSettings();
  const rows = winBackCandidates(data?.leads ?? [], today).slice(0, 12);
  if (!canEdit || rows.length === 0) return null;
  return (
    <Collapsible icon={RotateCcw} title={`${rows.length} lost ${rows.length === 1 ? "lead" : "leads"} worth another try`} tone="border-teal-200 bg-teal-50/60 text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/5 dark:text-teal-300">
      {rows.map((l) => (
        <WinBackRow key={l.id} lead={l} shopName={shop?.name || ""} />
      ))}
    </Collapsible>
  );
}

/** Fitting trials today and tomorrow, each with a one-tap reminder to the customer. */
export function TrialsCard({ today, canEdit }: { today: string; canEdit: boolean }) {
  const { data } = useTasks({ status: "open" }, canEdit);
  const { data: shop } = useShopSettings();
  const tomorrow = addDaysIso(today, 1);
  const rows = (data ?? []).filter((t) => t.tags?.includes(TRIAL_TAG) && !!t.dueDate && t.dueDate >= today && t.dueDate <= tomorrow).sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string) || a.title.localeCompare(b.title));
  if (!canEdit || rows.length === 0) return null;
  return (
    <Collapsible icon={CalendarClock} title={`${rows.length} fitting ${rows.length === 1 ? "trial" : "trials"} today / tomorrow`} tone="border-sky-200 bg-sky-50/60 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/5 dark:text-sky-300">
      {rows.map((t) => {
        const mobile = mobileFromTrial(t.description);
        const name = /—\s*(.+?)\s*\(/.exec(t.title)?.[1] ?? "there";
        const time = /^Trial\s+(\d{1,2}:\d{2}\s?[AP]M)/.exec(t.title)?.[1] ?? "";
        const when = t.dueDate === today ? "today" : "tomorrow";
        return mobile ? (
          <Row key={t.id} name={t.title.replace(/^Trial\s*/, "")} sub={`${when === "today" ? "Today" : "Tomorrow"}`} href={wa(mobile, trialMessage({ name, shop: shop?.name || "", dateLabel: when, time, reminder: true }))} label={`Remind ${name} about the trial`} />
        ) : (
          <li key={t.id} className="rounded-lg bg-card px-3 py-2 text-sm text-foreground">
            {t.title}
          </li>
        );
      })}
    </Collapsible>
  );
}

/** Regulars who usually order every couple of months and are due again — a relaxed "ready for something new?" message. Works without AI (plain wording). */
export function ReorderCard({ canEdit }: { canEdit: boolean }) {
  const { data } = useReorderNudges(canEdit);
  const [message, setMessage] = useState<string | null>(null);
  if (!canEdit || !data || data.customers.length === 0) return null;
  const text = message ?? data.message;
  return (
    <Collapsible icon={Repeat} title={`${data.customers.length} regular ${data.customers.length === 1 ? "customer is" : "customers are"} due for a new outfit`} tone="border-indigo-200 bg-indigo-50/60 text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/5 dark:text-indigo-300">
      <li className="space-y-1">
        <Textarea value={text} onChange={(e) => setMessage(e.target.value)} rows={3} className="bg-card text-base text-foreground" aria-label="Message to send" />
        <p className="text-xs text-muted-foreground">
          {data.aiDrafted ? "Written by AI — " : ""}
          {"{name}"} and {"{garment}"} are filled in for each customer. Edit freely.
        </p>
      </li>
      {data.customers.map((c) => (
        <Row key={c.mobile} name={c.name} sub={`Usually orders every ~${Math.round(c.usualGapDays / 7)} weeks · last ${c.daysSince} days ago${c.lastGarment ? ` (${c.lastGarment})` : ""}`} href={wa(c.mobile, fillReorder(text, c))} label={`Message ${c.name} on WhatsApp`} />
      ))}
    </Collapsible>
  );
}
