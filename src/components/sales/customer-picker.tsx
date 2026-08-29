"use client";

import { useState, useMemo } from "react";
import { Search, User, UserPlus, Loader2 } from "lucide-react";
import { useCustomers } from "@/hooks/use-customers";
import { useSaveCustomer } from "@/hooks/use-customer-mutations";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Customer } from "@/lib/types";

export function CustomerPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (customer: Customer) => void;
}) {
  const { data: customers } = useCustomers();
  const saveCustomer = useSaveCustomer();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [addError, setAddError] = useState("");

  const filtered = useMemo(() => {
    const list = customers || [];
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q));
  }, [customers, query]);

  function handleSelect(c: Customer) {
    onOpenChange(false);
    setQuery("");
    onSelect(c);
  }

  function startAdding() {
    setAdding(true);
    setNewName(query.trim()); // pre-fill with whatever was searched
    setNewMobile("");
    setAddError("");
  }

  function cancelAdding() {
    setAdding(false);
    setNewName("");
    setNewMobile("");
    setAddError("");
  }

  async function handleAddCustomer() {
    if (!newName.trim()) { setAddError("Name is required"); return; }
    if (!newMobile.trim()) { setAddError("Mobile is required"); return; }
    setAddError("");
    try {
      await saveCustomer.mutateAsync({ name: newName.trim(), mobile: newMobile.trim(), notes: "" });
      const created: Customer = {
        id: `CUST-${newMobile.trim()}`,
        name: newName.trim(),
        mobile: newMobile.trim(),
        email: "", dob: "", anniversary: "", address: "",
        notes: "", paymentTerms: "due_on_receipt", priceListId: null,
        gstin: "", loyaltyPoints: 0, totalEarned: 0, loyaltyHistory: [],
        measurements: {}, tags: [], createdAt: new Date().toISOString(), whatsappOptOut: false,
      };
      cancelAdding();
      handleSelect(created);
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : "Failed to save customer");
    }
  }

  function handleClose(v: boolean) {
    if (!v) { setQuery(""); cancelAdding(); }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" /> Select customer
          </DialogTitle>
        </DialogHeader>

        {adding ? (
          <div className="px-4 py-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New customer</p>
            <div className="space-y-2">
              <Input
                autoFocus
                placeholder="Full name"
                className="h-9 text-sm"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Input
                placeholder="Mobile number"
                className="h-9 text-sm"
                value={newMobile}
                onChange={(e) => setNewMobile(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomer(); }}
              />
            </div>
            {addError && <p className="text-xs text-destructive">{addError}</p>}
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={handleAddCustomer}
                disabled={saveCustomer.isPending}
                className="flex-1"
              >
                {saveCustomer.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                Add & select
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={cancelAdding}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input autoFocus placeholder="Search name or mobile…" className="pl-8 h-9 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
            </div>
            <div className="max-h-[55dvh] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <User className="size-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No customers found</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((c) => (
                    <li key={c.mobile}>
                      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50" onClick={() => handleSelect(c)}>
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {c.name.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.mobile}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t px-4 py-3">
              <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={startAdding}>
                <UserPlus className="size-3.5" /> New customer
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CustomerPickerTrigger({ customerName, onClick }: { customerName: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} className="h-10 w-full justify-start font-normal">
      <User className="size-4" /> {customerName || "Select customer…"}
    </Button>
  );
}
