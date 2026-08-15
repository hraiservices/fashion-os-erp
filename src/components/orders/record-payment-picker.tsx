"use client";

import { useState, useMemo } from "react";
import { Search, CreditCard, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DueBadge } from "@/components/orders/stage-badge";
import { BalanceDue } from "@/components/ui/money-text";
import { inr } from "@/lib/format";
import type { Order } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
  onSelect: (order: Order) => void;
}

export function RecordPaymentPicker({ open, onOpenChange, orders, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const pendingOrders = useMemo(() => {
    const withBalance = orders
      .filter((o) => (o.balance || 0) > 0 && o.status !== "payment")
      .sort((a, b) => (b.balance || 0) - (a.balance || 0));

    if (!query.trim()) return withBalance;
    const q = query.toLowerCase();
    return withBalance.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (o.mobile || "").includes(q)
    );
  }, [orders, query]);

  function handleSelect(order: Order) {
    onOpenChange(false);
    setQuery("");
    onSelect(order);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setQuery("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            Select customer to record payment
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search by name, order ID or mobile…"
              className="pl-8 h-9 text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Order list */}
        <div className="overflow-y-auto max-h-[400px]">
          {pendingOrders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
              <CreditCard className="size-8 text-muted-foreground/30" />
              {query ? (
                <p className="text-sm text-muted-foreground">No results for "{query}"</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-muted-foreground">All payments collected</p>
                  <p className="text-xs text-muted-foreground/60">No orders have an outstanding balance</p>
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {pendingOrders.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => handleSelect(o)}
                  >
                    {/* Avatar initials */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {o.name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{o.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.id}
                        {o.mobile ? ` · ${o.mobile}` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <BalanceDue amount={o.balance} paidLabel={inr(o.balance)} className="text-sm font-semibold" />
                      <DueBadge order={o} />
                    </div>

                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {pendingOrders.length > 0 && (
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            {pendingOrders.length} order{pendingOrders.length !== 1 ? "s" : ""} with outstanding balance
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
