"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Small icon-only trigger for a quick-peek side panel — placed next to a selected
 *  customer/vendor's name in a form so staff can check balance/history without leaving the
 *  form. See CustomerQuickPeek / VendorQuickPeek. */
export function QuickPeekButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={onClick} aria-label={label} title={label}>
      <Eye className="size-4" />
    </Button>
  );
}
