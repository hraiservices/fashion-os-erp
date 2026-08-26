"use client";

import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { useUserRoles, useLinkEmployeeToUser } from "@/hooks/use-user-roles";
import { SearchSelect } from "@/components/ui/search-select";
import { Label } from "@/components/ui/label";

/**
 * The reverse side of the "linked employee" picker on the Users & Roles page
 * (src/components/settings/users-section.tsx) — same underlying link, same
 * useLinkEmployeeToUser() mutation, just picking a user_roles row instead of an employee. This
 * form never writes to `employees` for this field; `linked_employee_id` lives only on
 * `user_roles`, so both pickers stay a single source of truth.
 */
export function LinkedUserAccountManager({ employeeId }: { employeeId: string }) {
  const { data: rows } = useUserRoles();
  const linkEmployee = useLinkEmployeeToUser();

  const currentRow = (rows || []).find((r) => r.linked_employee_id === employeeId);

  async function handleSelect(email: string) {
    try {
      await linkEmployee.mutateAsync({ email, employeeId });
      toast.success("Linked to user account");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to link user account");
    }
  }

  async function handleUnlink() {
    if (!currentRow) return;
    try {
      await linkEmployee.mutateAsync({ email: currentRow.email, employeeId: null });
      toast.success("Unlinked from user account");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unlink");
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-foreground/80">Linked user account</Label>
      <p className="text-[11px] text-muted-foreground">If this employee also logs into the dashboard, link their account so both records show they're the same person.</p>
      <SearchSelect
        value={currentRow?.email || ""}
        fallbackLabel={currentRow?.email}
        placeholder="Type an email…"
        options={(rows || [])
          .filter((r) => r.email === currentRow?.email || !r.linked_employee_id)
          .map((r) => ({ value: r.email, label: r.email, sublabel: r.role }))}
        onSelect={handleSelect}
      />
      {currentRow && (
        <button type="button" onClick={handleUnlink} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
          <Link2 className="size-3" /> Unlink
        </button>
      )}
    </div>
  );
}
