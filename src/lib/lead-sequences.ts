import { addDaysIso } from "@/lib/work-tasks";

/**
 * Follow-up plans: a cadence of reminders a lead gets so nobody has to remember the next touch.
 * Each step becomes an ordinary task for the lead's owner on its day — nothing is ever sent
 * automatically; staff open the task and send. Pure — the definitions live in app_settings.
 */

export const LEAD_SEQUENCES_KEY = "leadSequences";
/** Tag put on every task a plan creates, so the rest can be called off in one go. */
export const SEQUENCE_TAG_PREFIX = "plan:";
export const sequenceTag = (id: string) => `${SEQUENCE_TAG_PREFIX}${id}`;

export type StepKind = "call" | "whatsapp";

export interface SequenceStep {
  /** Days after the lead arrives. 0 = same day. */
  days: number;
  kind: StepKind;
  title: string;
}

export interface LeadSequence {
  id: string;
  name: string;
  /** Start this plan by itself on every new lead. Only one plan can do that. */
  autoStart: boolean;
  steps: SequenceStep[];
}

export const DEFAULT_SEQUENCES: LeadSequence[] = [
  {
    id: "standard",
    name: "Standard enquiry",
    autoStart: false,
    steps: [
      { days: 0, kind: "whatsapp", title: "Say hello and ask what they need" },
      { days: 2, kind: "call", title: "Call to understand the occasion and budget" },
      { days: 5, kind: "whatsapp", title: "Share designs that fit what they want" },
      { days: 10, kind: "call", title: "Ask if they are ready to book" },
    ],
  },
  {
    id: "bridal",
    name: "Bridal / big order",
    autoStart: false,
    steps: [
      { days: 0, kind: "whatsapp", title: "Thank them and ask the wedding date" },
      { days: 1, kind: "call", title: "Call to invite them to the shop" },
      { days: 4, kind: "whatsapp", title: "Send bridal designs and price ranges" },
      { days: 8, kind: "call", title: "Offer a shop visit or a trial date" },
      { days: 15, kind: "whatsapp", title: "Gentle check-in before they decide elsewhere" },
      { days: 25, kind: "call", title: "Last follow-up before closing the enquiry" },
    ],
  },
];

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function cleanSequences(raw: unknown): LeadSequence[] {
  if (!Array.isArray(raw)) return DEFAULT_SEQUENCES;
  const seen = new Set<string>();
  let autoTaken = false;
  const out: LeadSequence[] = [];
  for (const item of raw.slice(0, 10)) {
    const r = (item && typeof item === "object" ? item : {}) as Partial<LeadSequence>;
    const id = str(r.id, 40).replace(/[^a-zA-Z0-9_-]/g, "") || `plan${out.length + 1}`;
    if (seen.has(id)) continue;
    const name = str(r.name, 60);
    const steps = (Array.isArray(r.steps) ? r.steps : [])
      .slice(0, 12)
      .map((s) => {
        const st = (s && typeof s === "object" ? s : {}) as Partial<SequenceStep>;
        const days = Math.min(180, Math.max(0, Math.round(Number(st.days) || 0)));
        return { days, kind: st.kind === "call" ? ("call" as const) : ("whatsapp" as const), title: str(st.title, 120) };
      })
      .filter((s) => s.title)
      .sort((a, b) => a.days - b.days);
    if (!name || steps.length === 0) continue;
    // Only the first plan marked auto-start keeps it, so a new lead can never collect two plans.
    const autoStart = r.autoStart === true && !autoTaken;
    if (autoStart) autoTaken = true;
    seen.add(id);
    out.push({ id, name, autoStart, steps });
  }
  return out.length ? out : DEFAULT_SEQUENCES;
}

export const autoStartSequence = (list: LeadSequence[]): LeadSequence | null => list.find((s) => s.autoStart) ?? null;

export interface PlannedTask {
  title: string;
  dueDate: string;
  kind: StepKind;
  tag: string;
}

/** The tasks a plan creates for one lead, dated from the day it starts. */
export function sequenceTasks(seq: LeadSequence, leadName: string, startDate: string): PlannedTask[] {
  const first = leadName.trim().split(/\s+/)[0] || "the customer";
  return seq.steps.map((s) => ({
    title: `${s.kind === "call" ? "Call" : "WhatsApp"} ${first}: ${s.title}`,
    dueDate: addDaysIso(startDate, s.days),
    kind: s.kind,
    tag: sequenceTag(seq.id),
  }));
}

/** Does this task belong to a follow-up plan? */
export const isSequenceTask = (tags: string[] | null | undefined) => (tags ?? []).some((t) => t.startsWith(SEQUENCE_TAG_PREFIX));
