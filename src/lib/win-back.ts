/** Lost leads worth another message: they said no for a reason that can change (price, timing, silence), 30–120 days ago. */

export interface WinBackLead {
  id: string;
  name: string;
  mobile: string;
  lostReason: string;
  lostAt: string | null;
}

const RECOVERABLE = ["Price too high", "Not interested now", "Needed it sooner", "No response"];

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function winBackCandidates<T extends WinBackLead>(leads: T[], today: string, minDays = 30, maxDays = 120): T[] {
  return leads
    .filter((l) => {
      if (!l.mobile || !l.lostAt || !RECOVERABLE.includes(l.lostReason)) return false;
      const age = dayDiff(l.lostAt.slice(0, 10), today);
      return age >= minDays && age <= maxDays;
    })
    .sort((a, b) => (a.lostAt as string).localeCompare(b.lostAt as string));
}

export function winBackMessage(name: string, reason: string, shopName: string): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  const shop = shopName || "us";
  switch (reason) {
    case "Price too high":
      return `Hi ${first}! This is ${shop}. We've added new designs and options in different price ranges since we last spoke — would you like to see a few that fit your budget?`;
    case "Needed it sooner":
      return `Hi ${first}! This is ${shop}. If you have an occasion coming up, booking a little early helps us deliver right on time. Shall we plan your outfit?`;
    case "Not interested now":
      return `Hi ${first}! This is ${shop}. Hope you're doing well! Planning anything special this season? We'd love to help with your outfit whenever you're ready.`;
    default:
      return `Hi ${first}! This is ${shop}. Just checking in — is there anything we can help you with for your outfit? We'd be happy to share some new designs.`;
  }
}
