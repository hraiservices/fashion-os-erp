"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUserRoles,
  useSetUserRole,
  useRenameUserEmail,
  useSetUserPhone,
  useLinkEmployeeToUser,
  useProvisionPhoneUser,
  useSetUserPin,
  useUserHasPin,
  type UserRoleRow,
} from "@/hooks/use-user-roles";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { useEmployees } from "@/hooks/use-employees";
import { useAppSetting } from "@/hooks/use-app-setting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Check, ChevronDown, ChevronRight, Info, Link2, KeyRound, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ROLE_DEFAULTS,
  ROLE_OPTIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  DEFAULT_ROLE_DEFAULT_OVERRIDES,
  type Permissions,
  type Role,
  type RoleDefaultOverrides,
} from "@/lib/permissions";

/** Base UI renders the raw value unless given a formatter (would show "admin", not "Admin"). */
const roleLabel = (v: unknown) => ROLE_OPTIONS.find(([val]) => val === v)?.[1] ?? String(v ?? "");

function PermCheck({ on }: { on: boolean }) {
  return (
    <span className={cn("mx-auto flex size-4 items-center justify-center rounded-full", on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/40")}>
      {on ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" />}
    </span>
  );
}

/** "What can each role do?" reference table — live-editable: clicking a cell changes that
 *  role's shop-wide starting permission (stored in app_settings as roleDefaultOverrides), not
 *  just one person's. Per-user overrides below still take precedence over whatever's set here. */
function RoleReferenceCard() {
  const qc = useQueryClient();
  const { data: overrides, isLoading } = useAppSetting<RoleDefaultOverrides>("roleDefaultOverrides", DEFAULT_ROLE_DEFAULT_OVERRIDES);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(role: Role, key: keyof Permissions) {
    const current = overrides?.[role]?.[key] ?? ROLE_DEFAULTS[role][key];
    const next: RoleDefaultOverrides = { ...overrides, [role]: { ...overrides?.[role], [key]: !current } };
    setSaving(`${role}.${key}`);
    try {
      const res = await fetch("/api/settings/role-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      qc.setQueryData(["app-setting", "roleDefaultOverrides"], next);
      qc.invalidateQueries({ queryKey: ["current-user"] });
      toast.success(`${PERMISSION_LABELS[key]} ${!current ? "granted" : "revoked"} for ${roleLabel(role)} by default`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  }

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
                    {ROLE_OPTIONS.map(([v]) => {
                      const on = overrides?.[v]?.[key] ?? ROLE_DEFAULTS[v][key];
                      const isOverridden = overrides?.[v]?.[key] !== undefined;
                      return (
                        <td key={v} className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            disabled={isLoading || saving === `${v}.${key}`}
                            onClick={() => toggle(v, key)}
                            title={isOverridden ? "Changed from the built-in default — click to toggle" : "Built-in default — click to toggle"}
                            className="mx-auto block disabled:opacity-50"
                          >
                            <PermCheck on={on} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          Click any checkmark to change that role&apos;s starting permission shop-wide. Expand any user below to override just that one person instead —
          e.g. a tailor who should only change order stage, or a manager who shouldn&apos;t delete orders.
        </p>
      </CardContent>
    </Card>
  );
}

interface PhoneCheckResult {
  found: boolean;
  collision?: boolean;
  emails?: string[];
  email?: string;
  linkedEmployeeName?: string | null;
  hasPin?: boolean;
  locked?: boolean;
}

/** "Why can't this mobile number log in?" diagnostic — mirrors what /api/auth/phone-login
 *  actually looks up (by phone, following the linked-employee PIN indirection) so an admin can
 *  see the real stored state instead of guessing from the login page's necessarily generic
 *  "Invalid mobile number or PIN" error. Never surfaces the PIN itself, only whether one is set. */
function PhoneCheckCard() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<PhoneCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch(`/api/user-roles/phone-check?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed");
      setResult(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Search className="size-4 text-muted-foreground" /> Why can&apos;t this number log in?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-40 flex-1"
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          />
          <Button onClick={check} disabled={checking || phone.length !== 10}>
            {checking ? "Checking…" : "Check"}
          </Button>
        </div>
        {result && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            {!result.found ? (
              <p className="text-destructive">No login has this phone number saved — mobile+PIN sign-in will always fail until one does.</p>
            ) : result.collision ? (
              <p className="text-destructive">
                <strong>{result.emails?.length}</strong> different logins all have this exact phone number ({result.emails?.join(", ")}) — that
                collision makes the login lookup ambiguous and fails for all of them. Clear the phone off every row but one.
              </p>
            ) : (
              <ul className="space-y-1">
                <li>
                  Login: <strong>{result.email}</strong>
                </li>
                <li>Linked employee: {result.linkedEmployeeName ? <strong>{result.linkedEmployeeName}</strong> : "none (uses its own PIN)"}</li>
                <li className={result.hasPin ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                  {result.hasPin ? "A PIN is set" : "No PIN is set — this is why sign-in fails"}
                </li>
                {result.locked && <li className="text-destructive">Currently locked out from too many failed attempts — wait or ask them to retry later.</li>}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Dashboard-login PIN control for one user, shown inside the expanded panel. Its own
 *  component (not inlined in the row .map()) because it needs useUserHasPin — a hook can't be
 *  called conditionally inside a list callback, only inside a real per-item component. Only
 *  ever mounted while that row is expanded, so the "is a PIN set?" fetch only ever happens for
 *  a row someone's actually looking at. */
function PinSection({
  row,
  employeeName,
  editing,
  pinVal,
  onEditValChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  saving,
}: {
  row: UserRoleRow;
  employeeName: string | undefined;
  editing: boolean;
  pinVal: string;
  onEditValChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { data: hasPin, isLoading } = useUserHasPin(row.email, !row.linked_employee_id);

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Dashboard PIN login</p>
      {row.linked_employee_id ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <KeyRound className="size-3.5" /> Managed from{" "}
          <Link href={`/employees/${row.linked_employee_id}/edit`} className="underline hover:text-foreground">
            {employeeName || "the linked employee"}&apos;s
          </Link>{" "}
          record — see &quot;Dashboard access&quot; there.
        </p>
      ) : editing ? (
        <div className="flex max-w-xs gap-1">
          <Input
            inputMode="numeric"
            maxLength={6}
            value={pinVal}
            onChange={(e) => onEditValChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="h-8"
            placeholder="4-6 digits"
          />
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Check className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelEdit}>
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <button type="button" onClick={onStartEdit} className="flex items-center gap-1.5 text-left text-sm text-muted-foreground hover:underline">
          <KeyRound className="size-3.5" />
          {isLoading ? "Checking…" : hasPin ? "PIN set — change" : "+ set PIN"}
        </button>
      )}
    </div>
  );
}

/** UsersSection(), Stitching_Manager_Pro_v16.html ~line 13397. Admin only. */
export function UsersSection() {
  const { data: rows, isLoading } = useUserRoles();
  const { data: entitlements } = useModuleEntitlements();
  const { data: employees } = useEmployees();
  const { data: roleDefaultOverrides } = useAppSetting<RoleDefaultOverrides>("roleDefaultOverrides", DEFAULT_ROLE_DEFAULT_OVERRIDES);
  const setRole = useSetUserRole();
  const renameEmail = useRenameUserEmail();
  const setPhone = useSetUserPhone();
  const linkEmployee = useLinkEmployeeToUser();
  const provisionPhone = useProvisionPhoneUser();
  const setPin = useSetUserPin();

  const employeesById = new Map((employees || []).map((e) => [e.id, e]));

  const [createMethod, setCreateMethod] = useState<"email" | "phone">("email");
  const [newEmail, setNewEmail] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newRole, setNewRole] = useState("tailor");
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [phoneVal, setPhoneVal] = useState("");
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [emailVal, setEmailVal] = useState("");
  const [editingPin, setEditingPin] = useState<string | null>(null);
  const [pinVal, setPinVal] = useState("");
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

  async function assignPhoneRole() {
    const mobile = newMobile.replace(/\D/g, "").slice(-10);
    if (mobile.length !== 10) return toast.error("Enter a valid 10-digit mobile number");
    if (!/^\d{4,6}$/.test(newPin)) return toast.error("PIN must be 4-6 digits");
    try {
      await provisionPhone.mutateAsync({ mobile, pin: newPin, role: newRole });
      setNewMobile("");
      setNewPin("");
      toast.success("Phone login created — share the mobile number and PIN with them");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  async function savePin(row: UserRoleRow) {
    if (pinVal.trim() !== "" && !/^\d{4,6}$/.test(pinVal)) return toast.error("PIN must be 4-6 digits");
    try {
      await setPin.mutateAsync({ email: row.email, pin: pinVal.trim() || null });
      setEditingPin(null);
      toast.success(pinVal.trim() ? "PIN saved" : "PIN removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save PIN");
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
    const roleDefault = ROLE_DEFAULTS[row.role as Role]?.[key] ?? false;
    const roleOverride = roleDefaultOverrides?.[row.role as Role]?.[key];
    return row.custom_permissions?.[key] ?? roleOverride ?? roleDefault;
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
      <PhoneCheckCard />
      <RoleReferenceCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Assign role to user</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={createMethod} onValueChange={(v) => v && setCreateMethod(v as "email" | "phone")}>
            <TabsList>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="phone">Phone + PIN</TabsTrigger>
            </TabsList>
          </Tabs>

          {createMethod === "email" ? (
            <div className="flex flex-wrap gap-2">
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
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-32 flex-1"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  value={newMobile}
                  onChange={(e) => setNewMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                />
                <Input
                  className="min-w-28 flex-1"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="4-6 digit PIN"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
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
                <Button onClick={assignPhoneRole} disabled={provisionPhone.isPending}>
                  Create
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Creates a login with no email at all — this person signs into the dashboard with just this mobile number and PIN. Share both with them directly.
              </p>
            </div>
          )}
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
                      <p className="mb-1.5 text-[11px] text-muted-foreground">
                        For an account that already exists on its own (e.g. an email/password login). To give a staff member dashboard access from
                        scratch, use &quot;Dashboard access&quot; on their own employee record instead — no need to come here at all.
                      </p>
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
                    <PinSection
                      row={row}
                      employeeName={row.linked_employee_id ? employeesById.get(row.linked_employee_id)?.name : undefined}
                      editing={editingPin === row.email}
                      pinVal={pinVal}
                      onEditValChange={setPinVal}
                      onStartEdit={() => {
                        setEditingPin(row.email);
                        setPinVal("");
                      }}
                      onCancelEdit={() => setEditingPin(null)}
                      onSave={() => savePin(row)}
                      saving={setPin.isPending}
                    />
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
                        Reset to &quot;{roleLabel(row.role)}&quot; defaults
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
