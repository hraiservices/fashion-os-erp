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
import { useSetEmployeeDashboardAccess } from "@/hooks/use-employee-dashboard-access";
import { useModuleEntitlements } from "@/hooks/use-module-entitlements";
import { useEmployees } from "@/hooks/use-employees";
import { useAppSetting } from "@/hooks/use-app-setting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, ChevronRight, Info, Link2, KeyRound, Search, Plus, User, Mail, Phone, AlertTriangle, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
 *  just one person's. Per-user overrides in the wizard still take precedence over whatever's
 *  set here. */
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
              <th className="py-1.5 pr-2 text-left font-bold">Permission</th>
              {ROLE_OPTIONS.map(([v, l]) => (
                <th key={v} className="px-2 py-1.5 text-center font-bold">
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
          Click any checkmark to change that role&apos;s starting permission shop-wide. Open any user below to override just that one person instead —
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

/** Dashboard-login PIN control for a standalone (non-employee-linked) login, shown inside the
 *  wizard's Identity step. Its own component (not inlined) because it needs useUserHasPin — a
 *  hook can't be called conditionally inside a list callback. */
function PinSection({
  email,
  editing,
  pinVal,
  onEditValChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  saving,
}: {
  email: string;
  editing: boolean;
  pinVal: string;
  onEditValChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { data: hasPin, isLoading } = useUserHasPin(email, true);

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Dashboard PIN login</p>
      {editing ? (
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

type Identity = "employee" | "email" | "phone";
const STEPS = ["Identity", "Role", "Permissions", "Review"] as const;

interface WizardState {
  mode: "add" | "edit";
  editingRow: UserRoleRow | null;
  step: number;
  identity: Identity;
  employeeId: string | null;
  email: string;
  mobile: string;
  pin: string;
  role: Role;
  custom: Partial<Permissions>;
}

function blankWizardState(): WizardState {
  return { mode: "add", editingRow: null, step: 0, identity: "employee", employeeId: null, email: "", mobile: "", pin: "", role: "tailor", custom: {} };
}

/** The onboarding/edit wizard — the one place a login's identity, role, and permissions get set,
 *  whether it's a brand-new person or an existing row someone clicked on. Reuses the exact same
 *  mutations the old flat form used underneath; only the presentation changed. */
function UserWizard({
  state,
  onClose,
  employees,
  rows,
  employeesById,
  roleDefaultOverrides,
  maxStaffAccounts,
}: {
  state: WizardState;
  onClose: () => void;
  employees: { id: string; name: string; mobile: string }[];
  rows: UserRoleRow[];
  employeesById: Map<string, { name: string; mobile: string }>;
  roleDefaultOverrides: RoleDefaultOverrides | undefined;
  maxStaffAccounts: number | null | undefined;
}) {
  const [s, setS] = useState<WizardState>(state);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneVal, setPhoneVal] = useState(s.editingRow?.phone || "");
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailVal, setEmailVal] = useState(s.editingRow?.email || "");
  const [editingPin, setEditingPin] = useState(false);
  const [pinVal, setPinVal] = useState("");

  const setRole = useSetUserRole();
  const renameEmail = useRenameUserEmail();
  const setPhone = useSetUserPhone();
  const linkEmployee = useLinkEmployeeToUser();
  const provisionPhone = useProvisionPhoneUser();
  const setPin = useSetUserPin();
  const setEmployeeAccess = useSetEmployeeDashboardAccess();

  const isEdit = s.mode === "edit";
  const linkedEmployeeIds = new Set(rows.map((r) => r.linked_employee_id).filter((v): v is string => !!v));
  const employeeOptions = employees
    .filter((e) => !linkedEmployeeIds.has(e.id) || e.id === s.employeeId)
    .map((e) => ({ value: e.id, label: e.name, sublabel: e.mobile }));

  function permValue(key: keyof Permissions): boolean {
    const roleDefault = ROLE_DEFAULTS[s.role][key];
    const roleOverride = roleDefaultOverrides?.[s.role]?.[key];
    return s.custom[key] ?? roleOverride ?? roleDefault;
  }

  function togglePerm(key: keyof Permissions) {
    setS((prev) => ({ ...prev, custom: { ...prev.custom, [key]: !permValue(key) } }));
  }

  const step1Valid =
    isEdit || (s.identity === "employee" && !!s.employeeId) || (s.identity === "email" && s.email.includes("@")) || (s.identity === "phone" && s.mobile.length === 10 && /^\d{4,6}$/.test(s.pin));

  async function handleSave() {
    try {
      if (s.identity === "employee") {
        const employeeId = isEdit ? s.editingRow!.linked_employee_id! : s.employeeId!;
        await setEmployeeAccess.mutateAsync({ employeeId, enabled: true, role: s.role, custom: s.custom });
      } else if (isEdit) {
        await setRole.mutateAsync({ email: s.editingRow!.email, role: s.role, custom: s.custom });
      } else if (s.identity === "email") {
        const isNewUser = !rows.some((r) => r.email.toLowerCase() === s.email.trim().toLowerCase());
        await setRole.mutateAsync({ email: s.email.trim(), role: s.role, custom: s.custom });
        if (isNewUser && maxStaffAccounts != null && rows.length + 1 >= maxStaffAccounts) {
          toast.warning(`You've reached your plan's staff account limit (${rows.length + 1}/${maxStaffAccounts}). Contact us to upgrade.`);
        }
      } else {
        await provisionPhone.mutateAsync({ mobile: s.mobile, pin: s.pin, role: s.role, custom: s.custom });
      }
      toast.success(isEdit ? "Access updated" : "User added");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  /** Only meaningful for an employee-linked login — unlinking removes their dashboard access
   *  (see the dashboard-access route). There's no equivalent "revoke" for a standalone
   *  email/phone login today (it has no employee record to unlink from), so this action isn't
   *  offered there — only email/phone/PIN edits are, same as before this screen existed. */
  async function handleRemoveAccess() {
    if (!s.editingRow?.linked_employee_id) return;
    try {
      await setEmployeeAccess.mutateAsync({ employeeId: s.editingRow.linked_employee_id, enabled: false });
      toast.success("Dashboard access removed");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove access");
    }
  }

  const saving = setRole.isPending || provisionPhone.isPending || setEmployeeAccess.isPending;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? employeesById.get(s.editingRow?.linked_employee_id || "")?.name || s.editingRow?.email : "Add a user"}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b pb-2 text-xs">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              disabled={!isEdit && i > 0 && !step1Valid}
              onClick={() => setS((prev) => ({ ...prev, step: i }))}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                s.step === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {s.step === 0 && (
          <div className="space-y-3">
            {!isEdit ? (
              <>
                <p className="text-xs text-muted-foreground">Who is this? Most staff should be linked to their employee record.</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["employee", "email", "phone"] as Identity[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setS((prev) => ({ ...prev, identity: v }))}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs font-medium",
                        s.identity === v ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {v === "employee" ? <User className="size-4" /> : v === "email" ? <Mail className="size-4" /> : <Phone className="size-4" />}
                      {v === "employee" ? "Employee" : v === "email" ? "Email login" : "Phone + PIN"}
                    </button>
                  ))}
                </div>

                {s.identity === "employee" && (
                  <SearchSelect
                    placeholder="Type a name or mobile number…"
                    value={s.employeeId || ""}
                    options={employeeOptions}
                    onSelect={(id) => setS((prev) => ({ ...prev, employeeId: id || null }))}
                  />
                )}
                {s.identity === "email" && (
                  <Input type="email" placeholder="user@email.com" value={s.email} onChange={(e) => setS((prev) => ({ ...prev, email: e.target.value }))} />
                )}
                {s.identity === "phone" && (
                  <div className="flex gap-2">
                    <Input
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="10-digit mobile number"
                      value={s.mobile}
                      onChange={(e) => setS((prev) => ({ ...prev, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    />
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="4-6 digit PIN"
                      value={s.pin}
                      onChange={(e) => setS((prev) => ({ ...prev, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    />
                  </div>
                )}
                {s.identity === "phone" && (
                  <p className="text-xs text-muted-foreground">Creates a login with no email at all — this person signs in with just this mobile number and PIN.</p>
                )}
              </>
            ) : s.identity === "employee" ? (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm">
                  <Link2 className="size-3.5 text-emerald-600 dark:text-emerald-400" /> Linked to{" "}
                  <Link href={`/employees/${s.editingRow!.linked_employee_id}/edit`} className="font-medium underline">
                    {employeesById.get(s.editingRow!.linked_employee_id!)?.name || "this employee"}
                  </Link>
                </p>
                <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={handleRemoveAccess} disabled={setEmployeeAccess.isPending}>
                  <AlertTriangle className="size-3.5" /> Remove dashboard access
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                  {editingEmail ? (
                    <div className="flex gap-1">
                      <Input value={emailVal} onChange={(e) => setEmailVal(e.target.value)} className="h-8" />
                      <Button
                        size="sm"
                        onClick={async () => {
                          const email = emailVal.trim().toLowerCase();
                          if (!email || !email.includes("@")) return toast.error("Enter a valid email address");
                          try {
                            await renameEmail.mutateAsync({ oldEmail: s.editingRow!.email, newEmail: email, role: s.editingRow!.role, phone: s.editingRow!.phone, custom: s.editingRow!.custom_permissions });
                            setS((prev) => ({ ...prev, editingRow: { ...prev.editingRow!, email } }));
                            setEditingEmail(false);
                            toast.success("Email updated");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed to update email");
                          }
                        }}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingEmail(false)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <button className="text-left text-sm hover:underline" onClick={() => { setEditingEmail(true); setEmailVal(s.editingRow!.email); }}>
                      {s.editingRow!.email}
                    </button>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
                  {editingPhone ? (
                    <div className="flex gap-1">
                      <Input value={phoneVal} onChange={(e) => setPhoneVal(e.target.value)} className="h-8" placeholder="10-digit" />
                      <Button
                        size="sm"
                        onClick={async () => {
                          const cleaned = phoneVal.replace(/\D/g, "").replace(/^91/, "").slice(-10);
                          if (phoneVal.trim() !== "" && cleaned.length !== 10) return toast.error("Enter a valid 10-digit mobile number");
                          try {
                            await setPhone.mutateAsync({ email: s.editingRow!.email, phone: cleaned || null });
                            setS((prev) => ({ ...prev, editingRow: { ...prev.editingRow!, phone: cleaned || null } }));
                            setEditingPhone(false);
                            toast.success(cleaned ? "Phone number saved" : "Phone number removed");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed to save phone");
                          }
                        }}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingPhone(false)}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <button className="text-left text-sm text-muted-foreground hover:underline" onClick={() => { setEditingPhone(true); setPhoneVal(s.editingRow!.phone || ""); }}>
                      {s.editingRow!.phone || "+ add phone"}
                    </button>
                  )}
                </div>
                <PinSection
                  email={s.editingRow!.email}
                  editing={editingPin}
                  pinVal={pinVal}
                  onEditValChange={setPinVal}
                  onStartEdit={() => { setEditingPin(true); setPinVal(""); }}
                  onCancelEdit={() => setEditingPin(false)}
                  onSave={async () => {
                    if (pinVal.trim() !== "" && !/^\d{4,6}$/.test(pinVal)) return toast.error("PIN must be 4-6 digits");
                    try {
                      await setPin.mutateAsync({ email: s.editingRow!.email, pin: pinVal.trim() || null });
                      setEditingPin(false);
                      toast.success(pinVal.trim() ? "PIN saved" : "PIN removed");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed to save PIN");
                    }
                  }}
                  saving={setPin.isPending}
                />
                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Link to an employee instead</p>
                  <SearchSelect
                    inputClassName="h-9"
                    placeholder="Type a name or mobile number…"
                    value=""
                    options={employeeOptions}
                    onSelect={async (id) => {
                      if (!id) return;
                      try {
                        await linkEmployee.mutateAsync({ email: s.editingRow!.email, employeeId: id });
                        toast.success("Linked to employee");
                        onClose();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed to link");
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {s.step === 1 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">What role does this person have?</p>
            <Select value={s.role} onValueChange={(v) => v && setS((prev) => ({ ...prev, role: v as Role }))}>
              <SelectTrigger className="w-full">
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
        )}

        {s.step === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Starting from &quot;{roleLabel(s.role)}&quot; defaults — toggle anything specific to just this person.
            </p>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.keys.map((key) => {
                    const on = permValue(key);
                    const isOverridden = s.custom[key] !== undefined;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => togglePerm(key)}
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
            {Object.keys(s.custom).length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setS((prev) => ({ ...prev, custom: {} }))} className="text-xs text-muted-foreground">
                Reset to &quot;{roleLabel(s.role)}&quot; defaults
              </Button>
            )}
          </div>
        )}

        {s.step === 3 && (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">Ready to save:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                {s.identity === "employee"
                  ? `Employee: ${isEdit ? employeesById.get(s.editingRow?.linked_employee_id || "")?.name : employeesById.get(s.employeeId || "")?.name}`
                  : s.identity === "email"
                    ? `Email: ${isEdit ? s.editingRow!.email : s.email}`
                    : `Phone: ${s.mobile}`}
              </li>
              <li>Role: {roleLabel(s.role)}</li>
              <li>{Object.keys(s.custom).length > 0 ? `${Object.keys(s.custom).length} permission(s) customized` : "Using role defaults"}</li>
            </ul>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" disabled={s.step === 0} onClick={() => setS((prev) => ({ ...prev, step: prev.step - 1 }))}>
            Back
          </Button>
          {s.step < 3 ? (
            <Button size="sm" disabled={s.step === 0 && !step1Valid} onClick={() => setS((prev) => ({ ...prev, step: prev.step + 1 }))}>
              Next <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add user"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** UsersSection() — "Users & Access". Admin only. Replaces the old flat assign-form + expandable
 *  row list, and the separate Employees -> "Dashboard access" toggle, with one wizard that
 *  handles onboarding a new login and editing an existing one the same way. */
export function UsersSection() {
  const { data: rows, isLoading } = useUserRoles();
  const { data: entitlements } = useModuleEntitlements();
  const { data: employees } = useEmployees();
  const { data: roleDefaultOverrides } = useAppSetting<RoleDefaultOverrides>("roleDefaultOverrides", DEFAULT_ROLE_DEFAULT_OVERRIDES);

  const employeesById = new Map((employees || []).map((e) => [e.id, e]));
  const [wizard, setWizard] = useState<WizardState | null>(null);

  function openAdd() {
    setWizard(blankWizardState());
  }

  function openEdit(row: UserRoleRow) {
    setWizard({
      mode: "edit",
      editingRow: row,
      step: 0,
      identity: row.linked_employee_id ? "employee" : "email",
      employeeId: row.linked_employee_id,
      email: row.email,
      mobile: row.phone || "",
      pin: "",
      role: row.role as Role,
      custom: row.custom_permissions || {},
    });
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm">All users ({(rows || []).length})</CardTitle>
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="size-4" /> Add user
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(rows || []).length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No users yet — add the first one.</p>}
          {(rows || []).map((row) => {
            const hasOverrides = !!row.custom_permissions && Object.keys(row.custom_permissions).length > 0;
            return (
              <button
                key={row.email}
                type="button"
                onClick={() => openEdit(row)}
                className="flex w-full flex-wrap items-center gap-2 rounded-md border p-3 text-left text-sm hover:bg-muted/40"
              >
                <div className="min-w-48 flex-1 truncate font-medium">
                  {row.linked_employee_id ? employeesById.get(row.linked_employee_id)?.name || row.email : row.email}
                </div>
                <Badge variant="secondary">{roleLabel(row.role)}</Badge>
                {hasOverrides && (
                  <Badge variant="outline" className="text-primary">
                    Customized
                  </Badge>
                )}
                {row.linked_employee_id && employeesById.get(row.linked_employee_id) && (
                  <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
                    <Link2 className="size-3" /> Employee
                  </Badge>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
              </button>
            );
          })}
        </CardContent>
      </Card>

      <PhoneCheckCard />
      <RoleReferenceCard />

      {wizard && (
        <UserWizard
          state={wizard}
          onClose={() => setWizard(null)}
          employees={employees || []}
          rows={rows || []}
          employeesById={employeesById}
          roleDefaultOverrides={roleDefaultOverrides}
          maxStaffAccounts={entitlements?.limits?.maxStaffAccounts}
        />
      )}
    </div>
  );
}
