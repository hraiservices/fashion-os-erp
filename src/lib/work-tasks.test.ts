import { describe, it, expect } from "vitest";
import {
  bucketTasks,
  canAssignTo,
  checklistProgress,
  compareTasks,
  isDueToday,
  isOverdue,
  isProjectOverdue,
  parseChecklist,
  projectProgress,
  subtaskProgress,
  taskVisibleTo,
  type TaskLike,
} from "./work-tasks";

const today = "2026-09-10";
const task = (over: Partial<TaskLike> = {}): TaskLike => ({ id: "t", status: "todo", dueDate: null, assigneeId: "asha", createdBy: "boss@shop.in", priority: "medium", ...over });

describe("overdue and due today", () => {
  it("flags open tasks past their date", () => {
    expect(isOverdue(task({ dueDate: "2026-09-09" }), today)).toBe(true);
    expect(isOverdue(task({ dueDate: "2026-09-10" }), today)).toBe(false);
    expect(isOverdue(task({ dueDate: null }), today)).toBe(false);
  });
  it("never flags a finished task", () => {
    expect(isOverdue(task({ dueDate: "2026-09-01", status: "done" }), today)).toBe(false);
    expect(isOverdue(task({ dueDate: "2026-09-01", status: "cancelled" }), today)).toBe(false);
    expect(isDueToday(task({ dueDate: today, status: "done" }), today)).toBe(false);
  });
  it("finds tasks due today", () => {
    expect(isDueToday(task({ dueDate: today }), today)).toBe(true);
  });
});

describe("bucketTasks", () => {
  it("groups open tasks for the Today screen, sorted, and leaves subtasks to their parent", () => {
    const b = bucketTasks(
      [
        task({ id: "late2", dueDate: "2026-09-08" }),
        task({ id: "late1", dueDate: "2026-09-02" }),
        task({ id: "now", dueDate: today }),
        task({ id: "soon", dueDate: "2026-09-20" }),
        task({ id: "none" }),
        task({ id: "fin", status: "done", dueDate: today }),
        task({ id: "sub", dueDate: today, parentTaskId: "now" }),
      ],
      today
    );
    expect(b.overdue.map((t) => t.id)).toEqual(["late1", "late2"]);
    expect(b.dueToday.map((t) => t.id)).toEqual(["now"]);
    expect(b.upcoming.map((t) => t.id)).toEqual(["soon"]);
    expect(b.noDate.map((t) => t.id)).toEqual(["none"]);
    expect(b.done.map((t) => t.id)).toEqual(["fin"]);
  });
  it("orders same-day tasks by priority", () => {
    const a = task({ id: "a", dueDate: today, priority: "low" });
    const b = task({ id: "b", dueDate: today, priority: "urgent" });
    expect([a, b].sort(compareTasks).map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("who can see and assign", () => {
  const viewer = { employeeId: "asha", email: "Asha@shop.in", seesAll: false };
  it("shows a task to its assignee and its creator (email case-insensitive)", () => {
    expect(taskVisibleTo({ assigneeId: "asha", createdBy: "x@y.in" }, viewer)).toBe(true);
    expect(taskVisibleTo({ assigneeId: "ravi", createdBy: "asha@shop.in" }, viewer)).toBe(true);
  });
  it("hides other people's tasks unless the viewer sees everything", () => {
    expect(taskVisibleTo({ assigneeId: "ravi", createdBy: "x@y.in" }, viewer)).toBe(false);
    expect(taskVisibleTo({ assigneeId: "ravi", createdBy: "x@y.in" }, { ...viewer, seesAll: true })).toBe(true);
  });
  it("hides tasks from a login with no staff record unless they created them", () => {
    const noStaff = { employeeId: null, email: "a@b.in", seesAll: false };
    expect(taskVisibleTo({ assigneeId: "ravi", createdBy: "x@y.in" }, noStaff)).toBe(false);
    expect(taskVisibleTo({ assigneeId: null, createdBy: "a@b.in" }, noStaff)).toBe(true);
  });
  it("lets staff assign only to themselves or nobody; assigners to anyone", () => {
    expect(canAssignTo("asha", { employeeId: "asha", canAssignOthers: false })).toBe(true);
    expect(canAssignTo(null, { employeeId: "asha", canAssignOthers: false })).toBe(true);
    expect(canAssignTo("ravi", { employeeId: "asha", canAssignOthers: false })).toBe(false);
    expect(canAssignTo("ravi", { employeeId: "asha", canAssignOthers: true })).toBe(true);
  });
});

describe("checklists, subtasks, projects", () => {
  it("counts checklist progress", () => {
    expect(checklistProgress([{ text: "a", done: true }, { text: "b", done: false }])).toEqual({ done: 1, total: 2 });
    expect(checklistProgress(null)).toEqual({ done: 0, total: 0 });
  });
  it("cleans a checklist coming out of the database", () => {
    expect(parseChecklist([{ text: "  Buy thread ", done: 1 }, { text: "   " }, null, "junk"])).toEqual([{ text: "Buy thread", done: true }]);
    expect(parseChecklist("nope")).toEqual([]);
  });
  it("rolls subtasks up under their parent, ignoring cancelled ones", () => {
    const tasks = [task({ id: "p" }), task({ id: "a", parentTaskId: "p", status: "done" }), task({ id: "b", parentTaskId: "p" }), task({ id: "c", parentTaskId: "p", status: "cancelled" })];
    expect(subtaskProgress("p", tasks)).toEqual({ done: 1, total: 2 });
  });
  it("computes a project's % done", () => {
    expect(projectProgress([{ status: "done" }, { status: "done" }, { status: "todo" }, { status: "cancelled" }])).toEqual({ done: 2, total: 3, pct: 67 });
    expect(projectProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
  });
  it("flags a project past its end date that isn't finished", () => {
    expect(isProjectOverdue({ endDate: "2026-09-01", status: "active" }, today)).toBe(true);
    expect(isProjectOverdue({ endDate: "2026-09-01", status: "done" }, today)).toBe(false);
    expect(isProjectOverdue({ endDate: null, status: "active" }, today)).toBe(false);
  });
});
