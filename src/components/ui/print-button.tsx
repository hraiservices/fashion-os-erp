"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PrintButtonProps {
  /** Omit to print the current page (window.print()). Pass a PDF/print-preview URL to open that in a new tab instead — used where a proper print template already exists (e.g. invoices). */
  href?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "xs" | "lg";
  className?: string;
  /** Class applied to the label <span> — e.g. "hidden lg:inline" to collapse to icon-only in a tight action row. */
  labelClassName?: string;
}

/** Reusable "Print" action — icon + label, styled like every other secondary action button (WhatsApp, Download, etc.) so it drops into any existing action group without looking bolted on. Hidden itself when printing, since it has nothing to do once the print dialog is open. */
export function PrintButton({ href, label = "Print", variant = "outline", size = "default", className, labelClassName }: PrintButtonProps) {
  const content = (
    <>
      <Printer className="size-4" /> <span className={labelClassName}>{label}</span>
    </>
  );
  if (href) {
    return (
      <Button variant={variant} size={size} className={cn("print:hidden", className)} nativeButton={false} render={<a href={href} target="_blank" rel="noopener noreferrer" />}>
        {content}
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} className={cn("print:hidden", className)} onClick={() => window.print()}>
      {content}
    </Button>
  );
}
