import { useQueryClient } from "@tanstack/react-query";
import { useCreateTask, usePatchTask, type TargetsMeta } from "@/hooks/use-targets";
import { addDaysIso } from "@/lib/work-tasks";
import type { LeadDto } from "@/lib/targets-types";

/**
 * Sets or moves a lead's next follow-up with one call. Used by the lead page's quick chips and the Today list's Snooze.
 * The follow-up belongs to the lead's owner when that is allowed (an active person you may assign to), else to you,
 * and it reminds on the day it is due.
 */
export function useLeadFollowUp(meta: TargetsMeta | undefined) {
  const createTask = useCreateTask();
  const patchTask = usePatchTask();
  const qc = useQueryClient();

  /** `forceNew` creates a fresh task even if the lead already has one (used right after the old one was completed). */
  async function schedule(lead: Pick<LeadDto, "id" | "name" | "assignedEmployeeId" | "nextFollowUp">, days: number, opts?: { forceNew?: boolean }) {
    const dueDate = addDaysIso(meta?.today ?? "", days);
    if (lead.nextFollowUp && !opts?.forceNew) {
      await patchTask.mutateAsync({ id: lead.nextFollowUp.id, dueDate });
    } else {
      const ownerOk = !!lead.assignedEmployeeId && !!meta?.staff.find((s) => s.id === lead.assignedEmployeeId && s.active) && (lead.assignedEmployeeId === meta.me.employeeId || !!meta.can.assignTasks);
      await createTask.mutateAsync({ title: `Follow up with ${lead.name}`, dueDate, reminder: "on_due", linkType: "lead", linkId: lead.id, ...(ownerOk ? { assigneeId: lead.assignedEmployeeId } : {}) });
    }
    // The lead lists show each lead's next follow-up, so they need a fresh read too.
    await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "targets" && ["leads", "lead", "tasks", "summary"].includes(q.queryKey[1] as string) });
    return dueDate;
  }

  return { schedule, pending: createTask.isPending || patchTask.isPending };
}
