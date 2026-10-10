"use client";

import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { FormActionBar } from "@/components/ui/form-action-bar";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Add / New screens for Targets, built the same way as New Expense, New Customer and the other
 * forms in the app: a sticky header with a Back link (and Save on phones), cards with an icon
 * section heading, bold labels with a red * on required fields, and a sticky Cancel / Save bar.
 */

export function SectionHeading({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 border-b pb-2">
      <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
        <Icon className="size-3.5 text-primary" />
      </div>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

export function FieldGroup({ label, required, error, hint, className, children }: { label: string; required?: boolean; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm font-bold text-foreground/80">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function FormCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl border bg-white p-5 shadow-sm dark:bg-card", className)}>{children}</div>;
}

/** Selectable pill used for statuses, sources, people and the like — one look everywhere in these forms. */
export function pillClass(on: boolean) {
  return cn("min-h-10 rounded-full border px-4 text-sm font-medium transition-colors", on ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card hover:bg-muted/50");
}

export function FormShell({
  backHref,
  backLabel,
  title,
  submitLabel,
  busy,
  onSubmit,
  extraActions,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  submitLabel: string;
  busy?: boolean;
  onSubmit: () => void;
  /** Rendered to the left of Cancel / Save in the bottom bar (e.g. Delete). */
  extraActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <form
      noValidate
      className="min-h-screen bg-muted/30"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="sticky top-0 z-20 border-b bg-white shadow-sm dark:bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 sm:px-6">
          <BackLink href={backHref}>
            <span className="hidden sm:inline">{backLabel}</span>
          </BackLink>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{title}</h1>
          </div>
          {/* Same Save as the bottom bar, phones only, so it is reachable without scrolling. */}
          <div className="flex items-center gap-2 sm:hidden">
            <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="gap-1.5" disabled={busy}>
              <Save className="size-3.5" />
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">{children}</div>

      <FormActionBar className="justify-start sm:justify-end">
        {extraActions}
        <Button type="button" variant="outline" size="lg" className="h-11 px-4 text-sm sm:h-7 sm:px-2.5 sm:text-[0.8rem]" onClick={() => router.back()} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="h-11 flex-1 gap-1.5 px-4 text-sm sm:h-7 sm:flex-none sm:px-2.5 sm:text-[0.8rem]" disabled={busy}>
          <Save className="size-3.5" />
          {busy ? "Saving…" : submitLabel}
        </Button>
      </FormActionBar>
    </form>
  );
}
