/**
 * The "Recent Updates" tab on the Dashboard — a plain, hand-maintained list, same spirit as
 * Zoho's own changelog tab. There's no admin UI for this on purpose: it's written in plain
 * language for shop staff, not generated from commit messages or PR titles, so whoever ships a
 * user-facing change adds one entry here (newest first) describing what changed in terms a
 * tailor/shop owner would recognize. UPCOMING_FEATURES is the "coming soon" section — also
 * hand-maintained, and fine to leave empty when nothing is actively planned.
 */

export interface ChangelogEntry {
  date: string; // "YYYY-MM-DD"
  title: string;
  description: string;
}

export const SHIPPED_UPDATES: ChangelogEntry[] = [
  {
    date: "2026-10-23",
    title: "Getting Started guide on the Dashboard",
    description: "A new step-by-step guide for setting up your shop — company profile, first product, first customer, first order, first invoice — each one opens right there, no need to hunt for the right page.",
  },
  {
    date: "2026-10-23",
    title: "Lead notes now stand out in red",
    description: "The free-text note on a lead's detail page is shown in red so it's easy to spot at a glance.",
  },
  {
    date: "2026-10-23",
    title: "Sort customers in Card view",
    description: "Customers → Cards now has a Sort by control (Name, Orders, Spent, Last order, Balance) — previously only List view could be sorted.",
  },
  {
    date: "2026-10-23",
    title: "Tailor Payable Report now matches the summary report",
    description: "A garment now counts as \"completed\" on the Tailor Payable Report as soon as its order reaches Finishing — same rule the summary report already used, so the two numbers agree.",
  },
  {
    date: "2026-10-23",
    title: "Fixed an order's Tailor field going out of sync",
    description: "Changing a garment's tailor on the Edit Order form now updates the order's own Tailor field too, so the two no longer show different names for the same order.",
  },
  {
    date: "2026-10-23",
    title: "Page header background: adjustable opacity",
    description: "Settings → Personalize → Appearance → Page header background now has an Opacity slider, so the faint pattern behind every page title can be tuned to taste instead of a fixed level.",
  },
  {
    date: "2026-10-22",
    title: "Page header background is now actually visible",
    description: "The faint illustration behind page titles was too subtle to see in practice, and was hidden entirely in dark mode — both fixed.",
  },
  {
    date: "2026-10-22",
    title: "Fixed a brief color flash on every page load",
    description: "The shop's accent color used to flicker in for a moment on every page load. It's now applied before the page even paints.",
  },
  {
    date: "2026-10-22",
    title: "Loyalty points for reviews, and a referral nudge",
    description: "Staff can now award loyalty points when a customer leaves a review, and the Today tab suggests recently-delivered customers to invite for a referral — with a coupon issued and a WhatsApp message ready to send.",
  },
];

export const UPCOMING_FEATURES: ChangelogEntry[] = [];
