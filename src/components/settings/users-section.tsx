"use client";

import { Fragment, useState } from "react";
import { toast } from "sonner";
import { useUserRoles, useSetUserRole, useRenameUserEmail, useSetUserPhone, useLinkEmployeeToUser, type UserRoleRow } from "@/hooks/use-user-roles";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { useEmployees } from "@/hooks/use-employees";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Check, ChevronDown, ChevronRight, Info, Link2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROLE_DEFAULTS, PERMISSION_LABELS, type Permissions, type Role } from "@/lib/permissions";

const ROLE_OPTIONS: [string, string][] = [
  ["admin", "Admin"],
  ["manager", "Manager"],
  ["sales", "Sales Staff"],
  ["tailor", "Tailor"],
];

/** Groups PERMISSION_LABELS keys for a readable checklist, in both the role-reference table and the per-user override panel. */
const PERMISSION_GROUPS: { label: string; keys: (keyof Permissions)[] }[] = [
  { label: "Orders", keys: ["addOrder", "editOrder", "deleteOrder", "changeStage", "managePayments", "editMeasurements"] },
  { label: "Customers", keys: ["manageCustomers", "deleteCustomers"] },
  { label: "Modules", keys: ["manageInventory", "managePurchases", "manageManufacturing", "manageSales"] },
  { label: "Admin", keys: ["viewReports", "manageUsers", "useChatbot"] },
];

/** Base UI renders the raw value unless given a formatter (would show "admin", not "Admin"). */
const roleLabel = (v: unknown) => ROLE_OPTIONS.find(([val]) => val === v)?.[1] ?? String(v ?? "");

function PermCheck({ on }: { on: boolean }) {
  return (
    <span className={cn("mx-auto flex size-4 items-center justify-center rounded-full", on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/40")}>
      {on ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" />}
    </span>
  );
}

/** "What can each role do?" reference table — shows the built-in default matrix so an admin knows
 *  what tailor/manager/sales start with, before layering a per-user override on top. */
function RoleReferenceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Info className="size-4 text-muted-foreground" /> What can each role do?
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-1.5 pr-2 text-left font-medium">Permission</th>
              {ROLE_OPTIONS.map(([v, l]) => (
                <th key={v} className="px-2 py-1.5 text-center font-medium">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((group) => (
              <Fragment key={group.label}>
                <tr>
                  <td colSpan={ROLE_OPTIONS.length + 1} className="pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </td>
                </tr>
                {group.keys.map((key) => (
                  <tr key={key} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">{PERMISSION_LABELS[key]}</td>
                    {ROLE_OPTIONS.map(([v]) => (
                      <td key={v} className="px-2 py-1.5 text-center">
                        <PermCheck on={ROLE_DEFAULTS[v as Role][key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          These are starting points. Expand any user below to override individual permissions — e.g. a tailor who should only change order stage, or a manager who shouldn't delete orders.
        </p>
      </CardContent>
    </Card>
  );
}

/** UsersSection(), Stitching_Manager_Pro_v16.html ~line 13397. Admin only. */
export function UsersSection() {
  const { data: rows, isLoading } = useUserRoles();
  const { data: entitlements } = useModuleEntitlements();
  const { data: employees } = useEmployees();
  const setRole = useSetUserRole();
  const renameEmail = useRenameUserEmail();
  const setPhone = useSetUserPhone();
  const linkEmployee = useLinkEmployeeToUser();

  const employeesById = new Map((employees || []).map((e) => [e.id, e]));

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("tailor");
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [phoneVal, setPhoneVal] = useState("");
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [emailVal, setEmailVal] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function assignRole() {
    if (!newEmail.trim()) return toast.error("Enter email");
    const isNewUser = !rows?.some((r) => r.email.toLowerCase() === newEmail.trim().toLowerCase());
    try {
      await setRole.mutateAsync({ email: newEmail.trim(), role: newRole });
      setNewEmail("");
      toast.success("Role assigned");
      // Soft cap only — the assignment above already succeeded regardless of this check.
      const maxStaff = entitlements?.limits?.maxStaffAccounts;
      const newCount = (rows?.length || 0) + (isNewUser ? 1 : 0);
      if (isNewUser && maxStaff != null && newCount >= maxStaff) {
        toast.warning(`You've reached your plan's staff account limit (${newCount}/${maxStaff}). Contact us to upgrade.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function updateRole(row: UserRoleRow, role: string) {
    try {
      await setRole.mutateAsync({ email: row.email, role, custom: row.custom_permissions || {} });
      toast.success("Role updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  function permValue(row: UserRoleRow, key: keyof Permissions): boolean {
    return row.custom_permissions?.[key] ?? ROLE_DEFAULTS[row.role as Role]?.[key] ?? false;
  }

  async function togglePerm(row: UserRoleRow, key: keyof Permissions) {
    const current = permValue(row, key);
    try {
      await setRole.mutateAsync({ email: row.email, role: row.role, custom: { ...row.custom_permissions, [key]: !current } });
      toast.success(`${PERMISSION_LABELS[key]} ${!current ? "granted" : "revoked"} for ${row.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function resetToRoleDefaults(row: UserRoleRow) {
    try {
      await setRole.mutateAsync({ email: row.email, role: row.role, custom: {} });
      toast.success("Reset to role defaults");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function saveEmail(row: UserRoleRow) {
    const email = emailVal.trim().toLowerCase();
    if (!email || !email.includes("@")) return toast.error("Enter a valid email address");
    if (email === row.email) return setEditingEmail(null);
    try {
      await renameEmail.mutateAsync({ oldEmail: row.email, newEmail: email, role: row.role, phone: row.phone, custom: row.custom_permissions });
      setEditingEmail(null);
      toast.success("Email updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update email");
    }
  }

  async function savePhone(row: UserRoleRow) {
    const cleaned = phoneVal.replace(/\D/g, "").replace(/^91/, "").slice(-10);
    if (phoneVal.trim() !== "" && cleaned.length !== 10) return toast.error("Enter a valid 10-digit mobile number");
    try {
      await setPhone.mutateAsync({ email: row.email, phone: cleaned || null });
      setEditingPhone(null);
      toast.success(cleaned ? "Phone number saved" : "Phone number removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save phone");
    }
  }

  async function linkToEmployee(row: UserRoleRow, employeeId: string | null) {
    try {
      await linkEmployee.mutateAsync({ email: row.email, employeeId });
      toast.success(employeeId ? "Linked to employee" : "Unlinked from employee");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update link");
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <RoleReferenceCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Assign role to user</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input className="min-w-40 flex-[2]" type="email" placeholder="user@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <Select value={newRole} onValueChange={(v) => v && setNewRole(v)}>
            <SelectTrigger className="flex-1">
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
          <Button onClick={assignRole} disabled={setRole.isPending}>
            Assign
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All users ({(rows || []).length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(rows || []).map((row) => {
            const isExpanded = expanded === row.email;
            const hasOverrides = !!row.custom_permissions && Object.keys(row.custom_permissions).length > 0;
            return (
              <div key={row.email} className="rounded-md border text-sm">
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : row.email)}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                    aria-label={isExpanded ? "Collapse permissions" : "Expand permissions"}
                  >
                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </button>
                  <div className="min-w-48 flex-1">
                    {editingEmail === row.email ? (
                      <div className="flex gap-1">
                        <Input value={emailVal} onChange={(e) => setEmailVal(e.target.value)} className="h-8" />
                        <Button size="sm" onClick={() => saveEmail(row)}>
                          <Check className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingEmail(null)}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="text-left hover:underline"
                        onClick={() => {
                          setEditingEmail(row.email);
                          setEmailVal(row.email);
                        }}
                      >
                        {row.email}
                      </button>
                    )}
                  </div>
                  <div className="w-40">
                    {editingPhone === row.email ? (
                      <div className="flex gap-1">
                        <Input value={phoneVal} onChange={(e) => setPhoneVal(e.target.value)} className="h-8" placeholder="10-digit" />
                        <Button size="sm" onClick={() => savePhone(row)}>
                          <Check className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingPhone(null)}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="text-left text-muted-foreground hover:underline"
                        onClick={() => {
                          setEditingPhone(row.email);
                          setPhoneVal(row.phone || "");
                        }}
                      >
                        {row.phone || "+ add phone"}
                      </button>
                    )}
                  </div>
                  <Select value={row.role} onValueChange={(v) => v && updateRole(row, v)}>
                    <SelectTrigger className="w-40">
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
                  <Badge variant="secondary">{row.role}</Badge>
                  {hasOverrides && (
                    <Badge variant="outline" className="text-primary">
                      Customized
                    </Badge>
                  )}
                  {row.linked_employee_id && employeesById.get(row.linked_employee_id) && (
                    <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
                      <Link2 className="size-3" /> {employeesById.get(row.linked_employee_id)!.name}
                    </Badge>
                  )}
                </div>

                {isExpanded && (
                  <div className="space-y-3 border-t bg-muted/20 p-3">
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Linked employee</p>
                      <SearchSelect
                        className="max-w-xs"
                        inputClassName="h-9"
                        placeholder="Type a name or mobile number…"
                        value={row.linked_employee_id || ""}
                        fallbackLabel={row.linked_employee_id ? employeesById.get(row.linked_employee_id)?.name : undefined}
                        options={(employees || [])
                          .filter((e) => e.id === row.linked_employee_id || !(rows || []).some((r) => r.linked_employee_id === e.id))
                          .map((e) => ({ value: e.id, label: e.name, sublabel: e.mobile }))}
                        onSelect={(id) => linkToEmployee(row, id || null)}
                      />
                      {row.linked_employee_id && (
                        <button type="button" onClick={() => linkToEmployee(row, null)} className="mt-1 text-xs text-muted-foreground hover:text-destructive">
                          Unlink
                        </button>
                      )}
                    </div>
                    {PERMISSION_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.keys.map((key) => {
                            const on = permValue(row, key);
                            const isOverridden = row.custom_permissions?.[key] !== undefined;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => togglePerm(row, key)}
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
                    {hasOverrides && (
                      <Button size="sm" variant="ghost" onClick={() => resetToRoleDefaults(row)} className="text-xs text-muted-foreground">
                        Reset to "{roleLabel(row.role)}" defaults
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
