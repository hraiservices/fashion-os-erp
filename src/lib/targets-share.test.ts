import { describe, expect, it } from "vitest";
import {
  buildShareContacts,
  leadListShareMessage,
  leadShareMessage,
  leaderboardShareMessage,
  MAX_SHARE_ROWS,
  mailtoHref,
  plainText,
  projectShareMessage,
  reportShareMessage,
  shareDate,
  shareDue,
  targetShareMessage,
  taskListShareMessage,
  taskShareMessage,
  waChatHref,
  waPickerHref,
  whatsAppNumber,
  type ShareCtx,
} from "./targets-share";
import type { LeadDto, ProjectWithProgress, TargetWithProgress, TaskDto } from "./targets-types";

const people: Record<string, string> = { asha: "Asha Verma", ravi: "Ravi Kumar" };
const ctx: ShareCtx = { origin: "https://shop.example.com", today: "2026-10-10", nameOf: (id) => (id ? people[id] ?? "Unknown" : "Not assigned") };

const task = (over: Partial<TaskDto> = {}): TaskDto => ({
  id: "t-1", title: "Call tailor about lining", description: "", projectId: null, parentTaskId: null, groupName: "", assigneeId: "asha", priority: "high", status: "todo",
  startDate: null, dueDate: "2026-10-09", completedAt: null, checklist: [], linkType: null, linkId: null, taskNo: 12, taskListId: null, phaseId: null, tags: [],
  durationHours: null, completionPct: 0, reminder: "none", dependsOn: [], createdBy: "owner@shop.in", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...over,
});

const lead = (over: Partial<LeadDto> = {}): LeadDto => ({
  id: "l-1", name: "Sneha Kapoor", mobile: "9876543210", customerId: null, source: "Instagram", productInterest: "Bridal lehenga", expectedValue: 45000, stage: "talking",
  likelyToClose: true, assignedEmployeeId: "asha", lostReason: "", wonValue: 0, notes: "", wonAt: null, lostAt: null, orderId: null, invoiceId: null, createdBy: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...over,
});

const project = (over: Partial<ProjectWithProgress> = {}): ProjectWithProgress => ({
  id: "p-1", name: "Wedding season stock", description: "", ownerId: "ravi", startDate: "2026-10-01", endDate: "2026-12-31", status: "active", targetId: null, projectNo: 3,
  createdBy: null, createdAt: "2026-10-01T00:00:00Z", progress: { done: 1, total: 4, pct: 25 }, overdueTasks: 1, ...over,
});

const target = (over: Partial<TargetWithProgress> = {}): TargetWithProgress => ({
  id: "g-1", title: "October Sales", metric: "sales_value", targetValue: 500000, startDate: "2026-10-01", endDate: "2026-10-31", scope: "shop", assigneeIds: [], productIds: [],
  garmentTypes: [], statusOverride: null, notes: "", createdBy: null, createdAt: "2026-10-01T00:00:00Z",
  progress: { achieved: 35000, target: 500000, pct: 7, remaining: 465000, status: "at_risk", daysTotal: 31, daysElapsed: 10, daysLeft: 21, expected: 145000, projected: 108000, likely: 1200, forecast: 36200, byPerson: [] },
  ...over,
});

describe("dates", () => {
  it("reads the date off the text, so the timezone can't move it", () => {
    expect(shareDate("2026-10-09", "2026-10-10")).toBe("9 Oct");
    expect(shareDate("2027-01-03", "2026-10-10")).toBe("3 Jan 2027");
    expect(shareDate("2026-10-09")).toBe("9 Oct 2026");
  });
  it("leaves something that isn't a date alone", () => {
    expect(shareDate("soon")).toBe("soon");
    expect(shareDate("2026-13-01")).toBe("2026-13-01");
    expect(shareDate(null)).toBe("");
  });
  it("says how late or how close a due date is", () => {
    const t = "2026-10-10";
    expect(shareDue("2026-10-08", t)).toBe("8 Oct (overdue by 2 days)");
    expect(shareDue("2026-10-09", t)).toBe("9 Oct (overdue by 1 day)");
    expect(shareDue("2026-10-10", t)).toBe("10 Oct (today)");
    expect(shareDue("2026-10-11", t)).toBe("11 Oct (tomorrow)");
    expect(shareDue("2026-10-20", t)).toBe("20 Oct");
    expect(shareDue(null, t)).toBe("Not set");
  });
  it("does not call a finished task overdue", () => {
    expect(shareDue("2026-10-01", "2026-10-10", true)).toBe("1 Oct");
  });
});

describe("task message", () => {
  it("carries who, when, how urgent and a link that opens the task", () => {
    const m = taskShareMessage(task({ linkType: "lead", linkId: "l-1", linkLabel: "Himanshu", checklist: [{ text: "a", done: true }, { text: "b", done: false }], description: "Use the blue  silk" }), ctx, { projectName: "Wedding season stock" });
    expect(m.subject).toBe("Task: Call tailor about lining");
    expect(m.text.split("\n")).toEqual([
      "📝 *Task: Call tailor about lining*",
      "Owner: Asha Verma · High priority · To do",
      "Due: 9 Oct (overdue by 1 day)",
      "Project: Wedding season stock",
      "For lead: Himanshu",
      "Steps: 1 of 2 done",
      "Note: Use the blue silk",
      "Open: https://shop.example.com/targets?tab=tasks&task=t-1",
    ]);
  });
  it("copes with an unassigned task with no date, and with no origin", () => {
    const m = taskShareMessage(task({ assigneeId: null, dueDate: null }), { ...ctx, origin: "" });
    expect(m.text).toContain("Owner: Not assigned");
    expect(m.text).toContain("Due: Not set");
    expect(m.text).not.toContain("Open:");
  });
  it("shortens a long note", () => {
    const m = taskShareMessage(task({ description: "x".repeat(500) }), ctx);
    expect(m.text.split("\n").find((l) => l.startsWith("Note:"))!.length).toBeLessThan(260);
  });
});

describe("project message", () => {
  const tasks = [
    task({ id: "a", title: "Later job", dueDate: "2026-10-20" }),
    task({ id: "b", title: "Done job", status: "done" }),
    task({ id: "c", title: "Sub step", parentTaskId: "a" }),
    task({ id: "d", title: "Late job", dueDate: "2026-10-08", assigneeId: "ravi" }),
    task({ id: "e", title: "No date job", dueDate: null }),
  ];
  it("shows progress and the open tasks, soonest first, without finished tasks or subtasks", () => {
    const m = projectShareMessage(project(), tasks, ctx);
    expect(m.subject).toBe("Project: Wedding season stock");
    expect(m.text.split("\n")).toEqual([
      "📁 *Project: Wedding season stock* (P-3)",
      "Owner: Ravi Kumar · Active",
      "Dates: 1 Oct – 31 Dec",
      "Progress: 25% done (1 of 4 tasks) · 1 overdue",
      "Open tasks:",
      "• Late job — Ravi Kumar · overdue by 2 days",
      "• Later job — Asha Verma · due 20 Oct",
      "• No date job — Asha Verma",
      "Open: https://shop.example.com/targets/projects/p-1",
    ]);
  });
  it("has no 'Open tasks' heading when nothing is open", () => {
    expect(projectShareMessage(project({ projectNo: null, startDate: null, endDate: null }), [task({ status: "done" })], ctx).text).not.toContain("Open tasks");
  });
  it("lists at most 8 tasks and says how many more there are", () => {
    const many = Array.from({ length: 12 }, (_, i) => task({ id: `x${i}`, title: `Job ${i}`, dueDate: `2026-11-${String(i + 1).padStart(2, "0")}` }));
    const text = projectShareMessage(project(), many, ctx).text;
    expect(text.split("\n").filter((l) => l.startsWith("• ")).length).toBe(8);
    expect(text).toContain("+4 more — open the app for the full list");
  });
});

describe("lead message", () => {
  it("has the details someone needs to pick the lead up", () => {
    const m = leadShareMessage(lead({ notes: "Wants it before Diwali" }), ctx, { nextFollowUp: { title: "Call back", dueDate: "2026-10-11" } });
    expect(m.subject).toBe("Lead: Sneha Kapoor");
    expect(m.text.split("\n")).toEqual([
      "👤 *Lead: Sneha Kapoor*",
      "Phone: 9876543210",
      "Stage: Talking · ★ Likely to close",
      "Wants: Bridal lehenga · Expected: ₹45,000",
      "Owner: Asha Verma · Came from: Instagram",
      "Next follow-up: Call back — 11 Oct",
      "Note: Wants it before Diwali",
      "Open: https://shop.example.com/targets/leads/l-1",
    ]);
  });
  it("uses the shop's own stage names", () => {
    expect(leadShareMessage(lead({ stage: "visit", likelyToClose: false }), ctx, { labels: { visit: "Store visit" } }).text).toContain("Stage: Store visit\n");
  });
  it("shows the value of a won lead and the reason for a lost one", () => {
    expect(leadShareMessage(lead({ stage: "won", wonValue: 52000 }), ctx).text).toContain("Won: ₹52,000");
    expect(leadShareMessage(lead({ stage: "lost", lostReason: "Price too high" }), ctx).text).toContain("Lost because: Price too high");
  });
  it("leaves out what it doesn't have", () => {
    const text = leadShareMessage(lead({ mobile: "", productInterest: "", expectedValue: 0, source: "", assignedEmployeeId: null, likelyToClose: false }), ctx).text;
    expect(text).not.toContain("Phone");
    expect(text).not.toContain("Wants");
    expect(text).not.toContain("Expected");
    expect(text).toContain("Owner: Not assigned\n");
  });
});

describe("target and scoreboard messages", () => {
  it("reads a running target as a sentence with the pace", () => {
    expect(targetShareMessage(target(), ctx).text.split("\n")).toEqual([
      "🎯 *October Sales*",
      "₹35,000 of ₹5,00,000 (7%)",
      "Status: Behind pace · 21 days left",
      "Should be at ₹1,45,000 by now · heading for ₹1,08,000",
      "Likely to close: +₹1,200",
      "For: Whole shop · 1 Oct – 31 Oct",
      "Open: https://shop.example.com/targets/g-1",
    ]);
  });
  it("names the people and what is being counted", () => {
    const t = target({ scope: "person", assigneeIds: ["asha", "ravi"], garmentTypes: ["Suit"], progress: { ...target().progress, status: "achieved", likely: 0 } });
    const text = targetShareMessage(t, ctx, { productNames: ["Silk saree"] }).text;
    expect(text).toContain("For: Asha Verma, Ravi Kumar · 1 Oct – 31 Oct");
    expect(text).toContain("Counting only: Suit, Silk saree");
    expect(text).toContain("Status: Achieved\n");
    expect(text).not.toContain("days left");
  });
  it("numbers the scoreboard", () => {
    const rows = [
      { personId: "asha", name: "Asha Verma", value: 35000, sales: 30, leadsWon: 2, wonValue: 0, targetsHit: 0, incentive: 0 },
      { personId: null, name: "", value: 1000, sales: 1, leadsWon: 0, wonValue: 0, targetsHit: 0, incentive: 0 },
    ];
    const m = leaderboardShareMessage(rows, { from: "2026-10-01", to: "2026-10-31" }, ctx);
    expect(m.subject).toBe("Scoreboard — 1 Oct to 31 Oct");
    expect(m.text.split("\n")).toEqual([
      "🏆 *Scoreboard — 1 Oct to 31 Oct*",
      "1. Asha Verma — ₹35,000 · 30 sales · 2 won",
      "2. Not credited to anyone — ₹1,000 · 1 sale",
      "Open: https://shop.example.com/reports/sales-leaderboard",
    ]);
  });
});

describe("report message", () => {
  it("turns a report table into name — figure rows", () => {
    const m = reportShareMessage(
      { title: "Lead Sources & Win Rate", period: "1 Oct – 31 Oct", summaryLines: ["Leads: 7", "Overall win rate: 60%"], headers: ["Source", "Win rate", "Leads", "Won", "Lost"], rows: [["Instagram", "50%", "4", "1", "1"], ["Walk-in", "100%", "3", "2", "0"]], path: "/reports/lead-sources" },
      ctx
    );
    expect(m.subject).toBe("Lead Sources & Win Rate");
    expect(m.text.split("\n")).toEqual([
      "📊 *Lead Sources & Win Rate*",
      "Period: 1 Oct – 31 Oct",
      "Leads: 7",
      "Overall win rate: 60%",
      "• Instagram — Win rate 50% · Leads 4 · Won 1",
      "• Walk-in — Win rate 100% · Leads 3 · Won 2",
      "Open: https://shop.example.com/reports/lead-sources",
    ]);
  });
  it("handles a one-column report", () => {
    expect(reportShareMessage({ title: "T", headers: ["A"], rows: [["only"]], path: "/r" }, ctx).text).toContain("• only\n");
  });
});

describe("list digests", () => {
  const many = Array.from({ length: 30 }, (_, i) => task({ id: `t${i}`, title: `Task number ${i}`, dueDate: "2026-10-12" }));
  it("lists tasks with owner and due tag", () => {
    const m = taskListShareMessage("Overdue", [task(), task({ id: "t-2", title: "Order buttons", assigneeId: "ravi", dueDate: "2026-10-10" })], ctx, { path: "/targets" });
    expect(m.subject).toBe("Overdue (2)");
    expect(m.text.split("\n")).toEqual([
      "📝 *Overdue (2)*",
      "• Call tailor about lining — Asha Verma · overdue by 1 day",
      "• Order buttons — Ravi Kumar · due today",
      "Open: https://shop.example.com/targets",
    ]);
  });
  it("can leave the owner out (a person's own list)", () => {
    expect(taskListShareMessage("Mine", [task()], ctx, { showOwner: false }).text).toContain("• Call tailor about lining — overdue by 1 day");
  });
  it("stops at the row limit and says how many it left out", () => {
    const text = taskListShareMessage("All open", many, ctx).text;
    expect(text.split("\n").filter((l) => l.startsWith("• ")).length).toBe(MAX_SHARE_ROWS);
    expect(text).toContain(`+${30 - MAX_SHARE_ROWS} more — open the app for the full list`);
    expect(text.split("\n").at(-1)).toBe("Open: https://shop.example.com/targets?tab=tasks");
  });
  it("never runs past the length limit even with long titles", () => {
    const long = Array.from({ length: 30 }, (_, i) => task({ id: `l${i}`, title: "w".repeat(200) + i }));
    const text = taskListShareMessage("Long", long, ctx).text;
    expect(text.length).toBeLessThanOrEqual(1800);
    expect(text).toMatch(/\+\d+ more/);
  });
  it("lists leads with stage, product, value and owner", () => {
    const m = leadListShareMessage("Talking", [lead(), lead({ id: "l-2", name: "Himanshu", productInterest: "", expectedValue: 0, likelyToClose: false, stage: "new", assignedEmployeeId: null })], ctx);
    expect(m.text.split("\n")).toEqual([
      "👥 *Talking (2)*",
      "• Sneha Kapoor — Talking · Bridal lehenga · ₹45,000 · ★ · Asha Verma",
      "• Himanshu — New · Not assigned",
      "Open: https://shop.example.com/targets?tab=leads",
    ]);
  });
});

describe("lead lists without owners", () => {
  it("leaves the owner out when asked", () => {
    expect(leadListShareMessage("Mine", [lead()], ctx, { showOwner: false }).text).toContain("• Sneha Kapoor — Talking · Bridal lehenga · ₹45,000 · ★\n");
  });
});

describe("links", () => {
  it("opens a chat with a valid Indian number, in any common spelling", () => {
    const text = "Hi *there*\nline 2";
    const expected = `https://wa.me/919876543210?text=${encodeURIComponent(text)}`;
    expect(waChatHref("9876543210", text)).toBe(expected);
    expect(waChatHref("+91 98765 43210", text)).toBe(expected);
    expect(waChatHref("98765-43210", text)).toBe(expected);
  });
  it("never turns a missing or unusable number into the contact picker", () => {
    expect(waChatHref(null, "hi")).toBeNull();
    expect(waChatHref("", "hi")).toBeNull();
    expect(waChatHref("12345", "hi")).toBeNull();
    expect(waChatHref("+971501234567", "hi")).toBeNull();
    expect(whatsAppNumber("12345")).toBeNull();
  });
  it("opens WhatsApp's own contact picker for 'send to anyone'", () => {
    expect(waPickerHref("hi there")).toBe("https://wa.me/?text=hi%20there");
  });
  it("takes the WhatsApp stars out for email", () => {
    expect(plainText("📝 *Task: Call tailor*\nOwner: Asha\n5 * 3")).toBe("📝 Task: Call tailor\nOwner: Asha\n5 * 3");
  });
  it("builds a mail link with a readable address and line breaks the mail app understands", () => {
    const href = mailtoHref("asha+work@shop.in", { subject: "Task: Call tailor", text: "*Task*\nDue: 9 Oct\nOpen: https://x.test/a?b=1&c=2" });
    expect(href.startsWith("mailto:asha%2Bwork@shop.in?subject=Task%3A%20Call%20tailor&body=")).toBe(true);
    const body = decodeURIComponent(href.split("&body=")[1]);
    expect(body).toBe("Task\r\nDue: 9 Oct\r\nOpen: https://x.test/a?b=1&c=2");
  });
  it("leaves the address empty when there isn't one, and cuts an overlong body", () => {
    expect(mailtoHref(null, { subject: "S", text: "hi" })).toBe("mailto:?subject=S&body=hi");
    const long = mailtoHref("", { subject: "S", text: "y".repeat(5000) });
    expect(decodeURIComponent(long.split("&body=")[1]).length).toBeLessThanOrEqual(1900);
  });
});

describe("who it can be shared with", () => {
  const staff = [
    { id: "me", name: "Himanshu", role: "admin", mobile: "9000000001" },
    { id: "asha", name: "Asha Verma", role: "sales", mobile: " 9876543210 " },
    { id: "ravi", name: "Ravi Kumar", role: "tailor", mobile: "" },
    { id: "gone", name: "Left Long Ago", role: "tailor", mobile: "9000000002", active: false },
  ];
  const logins = [
    { email: "asha@shop.in", linked_employee_id: "asha" },
    { email: "asha.second@shop.in", linked_employee_id: "asha" },
    { email: "stranger@shop.in", linked_employee_id: null },
    { email: "  ", linked_employee_id: "ravi" },
  ];
  it("lists active staff other than the viewer, with the mobile tidied", () => {
    expect(buildShareContacts(staff, logins, { viewerEmployeeId: "me", includeEmails: false })).toEqual([
      { id: "asha", name: "Asha Verma", role: "sales", mobile: "9876543210", email: null },
      { id: "ravi", name: "Ravi Kumar", role: "tailor", mobile: null, email: null },
    ]);
  });
  it("adds login emails only when asked, one per person, ignoring blank and unlinked logins", () => {
    expect(buildShareContacts(staff, logins, { viewerEmployeeId: "me", includeEmails: true }).map((c) => [c.id, c.email])).toEqual([
      ["asha", "asha@shop.in"],
      ["ravi", null],
    ]);
  });
  it("still lists everyone when the viewer has no staff record", () => {
    expect(buildShareContacts(staff, [], { viewerEmployeeId: null, includeEmails: false }).map((c) => c.id)).toEqual(["me", "asha", "ravi"]);
  });
});
