/**
 * Colour sets for tab / toggle buttons, so each section of a screen has a colour of its own and is quick to spot.
 * Every class is written out in full (never built from a string) so Tailwind keeps it.
 *   idle      — an unselected tab: a soft tint with coloured text
 *   active    — the selected tab: solid colour, white text
 *   badge     — the small count pill on an unselected tab
 *   badgeOn   — the count pill on the selected tab
 */
export type Tone = "blue" | "amber" | "green" | "purple" | "rose" | "teal";

interface ToneClasses {
  idle: string;
  active: string;
  badge: string;
  badgeOn: string;
  /** For the shadcn Tabs trigger, which marks the selected tab with the `data-active` attribute instead. */
  tab: string;
}

export const TONES: Record<Tone, ToneClasses> = {
  blue: {
    idle: "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20",
    active: "bg-blue-600 text-white shadow-sm hover:bg-blue-600 dark:bg-blue-500 dark:text-white",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200",
    badgeOn: "bg-white/25 text-white",
    tab: "bg-blue-50 text-blue-700 hover:bg-blue-100 data-active:bg-blue-600 data-active:text-white data-active:hover:bg-blue-600 dark:bg-blue-500/10 dark:text-blue-300 dark:data-active:bg-blue-500 dark:data-active:text-white",
  },
  amber: {
    idle: "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20",
    active: "bg-amber-500 text-white shadow-sm hover:bg-amber-500 dark:bg-amber-500 dark:text-white",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    badgeOn: "bg-white/25 text-white",
    tab: "bg-amber-50 text-amber-800 hover:bg-amber-100 data-active:bg-amber-500 data-active:text-white data-active:hover:bg-amber-500 dark:bg-amber-500/10 dark:text-amber-300 dark:data-active:bg-amber-500 dark:data-active:text-white",
  },
  green: {
    idle: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20",
    active: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-600 dark:bg-emerald-500 dark:text-white",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
    badgeOn: "bg-white/25 text-white",
    tab: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 data-active:bg-emerald-600 data-active:text-white data-active:hover:bg-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300 dark:data-active:bg-emerald-500 dark:data-active:text-white",
  },
  purple: {
    idle: "bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20",
    active: "bg-violet-600 text-white shadow-sm hover:bg-violet-600 dark:bg-violet-500 dark:text-white",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
    badgeOn: "bg-white/25 text-white",
    tab: "bg-violet-50 text-violet-700 hover:bg-violet-100 data-active:bg-violet-600 data-active:text-white data-active:hover:bg-violet-600 dark:bg-violet-500/10 dark:text-violet-300 dark:data-active:bg-violet-500 dark:data-active:text-white",
  },
  rose: {
    idle: "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20",
    active: "bg-rose-600 text-white shadow-sm hover:bg-rose-600 dark:bg-rose-500 dark:text-white",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
    badgeOn: "bg-white/25 text-white",
    tab: "bg-rose-50 text-rose-700 hover:bg-rose-100 data-active:bg-rose-600 data-active:text-white data-active:hover:bg-rose-600 dark:bg-rose-500/10 dark:text-rose-300 dark:data-active:bg-rose-500 dark:data-active:text-white",
  },
  teal: {
    idle: "bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:bg-teal-500/20",
    active: "bg-teal-600 text-white shadow-sm hover:bg-teal-600 dark:bg-teal-500 dark:text-white",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-200",
    badgeOn: "bg-white/25 text-white",
    tab: "bg-teal-50 text-teal-700 hover:bg-teal-100 data-active:bg-teal-600 data-active:text-white data-active:hover:bg-teal-600 dark:bg-teal-500/10 dark:text-teal-300 dark:data-active:bg-teal-500 dark:data-active:text-white",
  },
};
