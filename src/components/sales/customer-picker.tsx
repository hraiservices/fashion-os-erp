"use client";

import { useState, useMemo } from "react";
import { Search, User } from "lucide-react";
import { useCustomers } from "@/hooks/use-customers";
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
  const [query, setQuery] = useState("");

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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setQuery(""); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" /> Select customer
          </DialogTitle>
        </DialogHeader>
        <div className="border-b px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input autoFocus placeholder="Search name or mobile…" className="pl-8 h-9 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="max-h-[60dvh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
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
      </DialogContent>
    </Dialog>
  );
}

export function CustomerPickerTrigger({ customerName, onClick }: { customerName: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} className="w-full justify-start font-normal">
      <User className="size-4" /> {customerName || "Select customer…"}
    </Button>
  );
}
