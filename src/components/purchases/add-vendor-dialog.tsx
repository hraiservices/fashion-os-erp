"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSaveVendor } from "@/hooks/use-purchase-mutations";
import { useCurrentUser } from "@/hooks/use-current-user";

/** Quick-add vendor for the middle of another form (e.g. a bill) — just the fields needed to
 *  start billing against them. Full details (GSTIN, address, notes) can be filled in later from
 *  the vendor's own page. */
export function AddVendorDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (vendorId: string, name: string) => void }) {
  const { data: user } = useCurrentUser();
  const saveVendor = useSaveVendor();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Enter a vendor name");
    try {
      const res = await saveVendor.mutateAsync({ name: trimmed, mobile, email: "", gstin: "", state: "", address: "", notes: "", userEmail: user?.email });
      toast.success(`Vendor "${trimmed}" added`);
      onCreated(res.id, trimmed);
      setName("");
      setMobile("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add vendor");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add vendor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-bold text-foreground/80">Business / vendor name</Label>
            <Input
              autoFocus
              placeholder="e.g. Anand Fabrics"
              className="h-10"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-bold text-foreground/80">Mobile</Label>
            <Input type="tel" placeholder="10-digit" className="h-10" value={mobile} onChange={(e) => setMobile(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saveVendor.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saveVendor.isPending}>
            {saveVendor.isPending ? "Adding…" : "Add vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
