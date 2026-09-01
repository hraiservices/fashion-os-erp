"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_DEFAULTS, ROLE_OPTIONS, PERMISSION_GROUPS, PERMISSION_LABELS, type Permissions, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface AccessState {
  enabled: boolean;
  role: Role;
  custom: Partial<Permissions>;
}

const roleLabel = (v: unknown) => ROLE_OPTIONS.find(([val]) => val === v)?.[1] ?? String(v ?? "");

/**
 * Replaces the old two-page dance for giving an employee dashboard access: Employees → Settings
 * → Users → type an email → link → back to Employees → set a phone → set a PIN. An employee's
 * own mobile number and self check-in PIN (the EmployeePinManager rendered right above this in
 * the form) are now the only credentials a linked dashboard login ever needs — this one toggle
 * plus role/permissions is the whole flow, backed by /api/employees/[id]/dashboard-access.
 */
export function DashboardAccessManager({ employeeId, employeeMobile }: { employeeId: string; employeeMobile?: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<AccessState>({ enabled: false, role: "tailor", custom: {} });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/employees/${employeeId}/dashboard-access`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.enabled) setState({ enabled: true, role: d.role, custom: d.custom_permissions || {} });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  function permValue(state: AccessState, key: keyof Permissions): boolean {
    return state.custom[key] ?? ROLE_DEFAULTS[state.role][key];
  }

  async function save(next: AccessState) {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/dashboard-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Sending the mobile number as currently typed (even if the rest of the form hasn't
        // been saved yet) lets turning this on auto-save just that field instead of failing
        // with "needs a valid mobile number first" until the admin saves the whole form.
        body: JSON.stringify({ enabled: next.enabled, role: next.role, custom: next.custom, mobile: employeeMobile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setState(next);
      toast.success(next.enabled ? "Dashboard access enabled" : "Dashboard access removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-xs font-medium text-foreground/80">Dashboard access</Label>
          <p className="text-[11px] text-muted-foreground">
            Lets this employee log into the app itself (not just self check-in) using their own mobile number
            {employeeMobile ? ` (${employeeMobile})` : ""} and the PIN above.
          </p>
        </div>
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 rounded"
          checked={state.enabled}
          disabled={saving}
          onChange={(e) => save({ ...state, enabled: e.target.checked })}
          aria-label="Enable dashboard access"
        />
      </div>

      {state.enabled && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground/80">Role</Label>
            <Select value={state.role} onValueChange={(v) => v && save({ ...state, role: v as Role })}>
              <SelectTrigger className="h-9 w-full sm:w-48" disabled={saving}>
                <SelectValue>{roleLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.keys.map((key) => {
                  const on = permValue(state, key);
                  const isOverridden = state.custom[key] !== undefined;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={saving}
                      onClick={() => save({ ...state, custom: { ...state.custom, [key]: !on } })}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:text-foreground",
                        isOverridden ? "border-primary/40 text-foreground" : "text-muted-foreground"
                      )}
                      title={isOverridden ? "Overridden from role default" : "Using role default"}
                    >
                      <span className={cn("flex size-3.5 items-center justify-center rounded-sm border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                        {on && <Check className="size-2.5" />}
                      </span>
                      {PERMISSION_LABELS[key]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
