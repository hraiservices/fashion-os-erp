import { describe, expect, it } from "vitest";
import { cleanSequences, DEFAULT_SEQUENCES, autoStartSequence, isSequenceTask, sequenceTag, sequenceTasks } from "@/lib/lead-sequences";

describe("cleanSequences", () => {
  it("falls back to the shipped plans for junk", () => {
    expect(cleanSequences(null)).toEqual(DEFAULT_SEQUENCES);
    expect(cleanSequences([{ name: "", steps: [] }])).toEqual(DEFAULT_SEQUENCES);
  });
  it("keeps good plans, sorts steps by day and drops empty ones", () => {
    const out = cleanSequences([{ id: "mine", name: "My plan", steps: [{ days: 5, kind: "call", title: "Ring them" }, { days: 1, kind: "whatsapp", title: "Hello" }, { days: 2, kind: "call", title: "  " }] }]);
    expect(out).toHaveLength(1);
    expect(out[0].steps.map((s) => s.days)).toEqual([1, 5]);
    expect(out[0].steps[0].title).toBe("Hello");
  });
  it("lets only one plan start by itself", () => {
    const out = cleanSequences([
      { id: "a", name: "A", autoStart: true, steps: [{ days: 0, kind: "call", title: "x" }] },
      { id: "b", name: "B", autoStart: true, steps: [{ days: 0, kind: "call", title: "y" }] },
    ]);
    expect(out.map((s) => s.autoStart)).toEqual([true, false]);
    expect(autoStartSequence(out)?.id).toBe("a");
  });
  it("drops a repeated id and cleans the id text", () => {
    const out = cleanSequences([
      { id: "a b/c", name: "One", steps: [{ days: 0, kind: "call", title: "x" }] },
      { id: "abc", name: "Two", steps: [{ days: 0, kind: "call", title: "y" }] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("abc");
  });
});

describe("sequenceTasks", () => {
  const seq = { id: "standard", name: "Standard", autoStart: false, steps: [{ days: 0, kind: "whatsapp" as const, title: "Say hello" }, { days: 3, kind: "call" as const, title: "Ask the budget" }] };
  it("dates each step from the start day and names the customer", () => {
    const tasks = sequenceTasks(seq, "Meera Shah", "2026-10-18");
    expect(tasks).toEqual([
      { title: "WhatsApp Meera: Say hello", dueDate: "2026-10-18", kind: "whatsapp", tag: "plan:standard" },
      { title: "Call Meera: Ask the budget", dueDate: "2026-10-21", kind: "call", tag: "plan:standard" },
    ]);
  });
  it("copes with a blank name", () => {
    expect(sequenceTasks(seq, "  ", "2026-10-18")[0].title).toContain("the customer");
  });
});

describe("isSequenceTask", () => {
  it("spots a plan's own tasks", () => {
    expect(isSequenceTask([sequenceTag("standard")])).toBe(true);
    expect(isSequenceTask(["trial"])).toBe(false);
    expect(isSequenceTask(null)).toBe(false);
  });
});
