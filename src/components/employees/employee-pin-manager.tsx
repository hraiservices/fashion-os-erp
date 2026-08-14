"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Self-contained (not react-hook-form-controlled) since it talks to its own dedicated server
 * route rather than the employee save payload — see /api/employees/[id]/set-pin and the
 * security note in use-employee-mutations.ts about why PIN setting never goes through the
 * regular save-employee mutation.
 */
export function EmployeePinManager({ employeeId }: { employeeId: string }) {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/employees/${employeeId}/set-pin`)
      .then((r) => r.json())
      .then((d) => setHasPin(!!d.hasPin))
      .catch(() => setHasPin(false));
  }, [employeeId]);

  async function handleSave() {
    if (!/^\d{4,6}$/.test(pin)) return toast.error("PIN must be 4-6 digits");
    if (pin !== confirmPin) return toast.error("PINs don't match");
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/set-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set PIN");
      toast.success("PIN saved");
      setHasPin(true);
      setEditing(false);
      setPin("");
      setConfirmPin("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to set PIN");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${employeeId}/set-pin`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove PIN");
      toast.success("PIN removed — self check-in disabled for this employee");
      setHasPin(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove PIN");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-foreground/80">Self check-in PIN</Label>
      <p className="text-[11px] text-muted-foreground">Lets this employee check in/out themselves at /checkin with a selfie and location.</p>

      {editing ? (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-2">
            <Input type="password" inputMode="numeric" maxLength={6} placeholder="New PIN" className="h-9" value={pin} onChange={(e) => setPin(e.target.value)} />
            <Input type="password" inputMode="numeric" maxLength={6} placeholder="Confirm PIN" className="h-9" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setPin(""); setConfirmPin(""); }}>Cancel</Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
              <Check className="size-3.5" /> Save PIN
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {hasPin === null ? null : hasPin ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <KeyRound className="size-3" /> PIN set
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>Change PIN</Button>
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={handleRemove} disabled={saving}>
                <X className="size-3.5" /> Remove
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <KeyRound className="size-3.5" /> Set PIN
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
