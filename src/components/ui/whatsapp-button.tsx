"use client";

import { useState, type ReactNode } from "react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { resolveWhatsAppHref, setWhatsAppPreference, useWhatsAppPreferenceStore, type WhatsAppApp } from "@/lib/whatsapp-launch";

/** "reminder" = a payment-reminder/nudge message — icon renders light orange instead of WhatsApp
 *  green, so it reads as a different action (chasing money) at a glance from a plain WhatsApp
 *  send, everywhere in the app. */
type WhatsAppTone = "whatsapp" | "reminder";

const TONE_ICON_COLOR: Record<WhatsAppTone, string> = {
  whatsapp: "text-[#25D366]",
  reminder: "text-orange-400",
};

const APP_LABELS: Record<WhatsAppApp, string> = { regular: "WhatsApp", business: "WhatsApp Business" };

/**
 * A web page can't see which WhatsApp apps are installed, so this always offers both known
 * Android variants rather than trying to detect one. `null` covers both "not yet hydrated" (SSR
 * snapshot) and "hydrated, nothing saved" — either way a click should open the chooser instead
 * of navigating straight through.
 */
function useWhatsAppPreference() {
  const preference = useWhatsAppPreferenceStore();
  return {
    preference,
    choose(app: WhatsAppApp, remember: boolean) {
      setWhatsAppPreference(remember ? app : null);
    },
  };
}

function AppChoice({ href, app, remember, onPick }: { href: string; app: WhatsAppApp; remember: boolean; onPick: () => void }) {
  return (
    <a
      href={resolveWhatsAppHref(href, app)}
      target={app === "regular" ? "_blank" : undefined}
      rel={app === "regular" ? "noopener noreferrer" : undefined}
      onClick={onPick}
      className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
    >
      <WhatsAppIcon className="size-4 text-[#25D366]" /> {APP_LABELS[app]}
      {remember && <span className="ml-auto text-xs font-normal text-muted-foreground">Always</span>}
    </a>
  );
}

/** The actual chooser content — "WhatsApp" vs "WhatsApp Business", with a checkbox to remember
 *  the pick on this device so the chooser doesn't ask again. */
function Chooser({ href, onChoose }: { href: string; onChoose: (app: WhatsAppApp, remember: boolean) => void }) {
  const [remember, setRemember] = useState(true);
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>Open with</PopoverTitle>
      </PopoverHeader>
      <div className="flex flex-col gap-1.5">
        {(["regular", "business"] as const).map((app) => (
          <AppChoice key={app} href={href} app={app} remember={remember} onPick={() => onChoose(app, remember)} />
        ))}
      </div>
      <label className="flex items-center gap-1.5 px-0.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-3.5 rounded accent-primary" />
        Always use this choice
      </label>
    </>
  );
}

interface WhatsAppButtonProps {
  href: string;
  label?: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "xs" | "lg";
  className?: string;
  /** Class applied to the label <span> — e.g. "hidden lg:inline" to collapse to icon-only on narrow screens. */
  labelClassName?: string;
  tone?: WhatsAppTone;
}

/** Icon + label WhatsApp action — the default everywhere there's room for text. */
export function WhatsAppButton({ href, label = "WhatsApp", variant = "outline", size = "default", className, labelClassName, tone = "whatsapp" }: WhatsAppButtonProps) {
  const { preference, choose } = useWhatsAppPreference();
  const [open, setOpen] = useState(false);

  if (preference !== null) {
    return (
      <Button
        variant={variant}
        size={size}
        className={cn("gap-1.5", className)}
        nativeButton={false}
        render={<a href={resolveWhatsAppHref(href, preference ?? "regular")} target="_blank" rel="noopener noreferrer" />}
      >
        <WhatsAppIcon className={cn("size-4", TONE_ICON_COLOR[tone])} /> <span className={labelClassName}>{label}</span>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant={variant} size={size} className={cn("gap-1.5", className)}>
            <WhatsAppIcon className={cn("size-4", TONE_ICON_COLOR[tone])} /> <span className={labelClassName}>{label}</span>
          </Button>
        }
      />
      <PopoverContent align="start">
        <Chooser
          href={href}
          onChoose={(app, remember) => {
            choose(app, remember);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Icon-only variant — only for genuinely tight spaces (Kanban cards, dense table rows). Always keep an aria-label. */
export function WhatsAppIconButton({ href, label = "Send WhatsApp message", className, tone = "whatsapp" }: { href: string; label?: string; className?: string; tone?: WhatsAppTone }) {
  const { preference, choose } = useWhatsAppPreference();
  const [open, setOpen] = useState(false);

  if (preference !== null) {
    return (
      <Button
        variant="outline"
        size="icon-sm"
        className={cn("size-11 shrink-0 sm:size-7", className)}
        aria-label={label}
        title={label}
        nativeButton={false}
        render={<a href={resolveWhatsAppHref(href, preference ?? "regular")} target="_blank" rel="noopener noreferrer" />}
      >
        <WhatsAppIcon className={cn("size-3.5", TONE_ICON_COLOR[tone])} />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="icon-sm" className={cn("size-11 shrink-0 sm:size-7", className)} aria-label={label} title={label}>
            <WhatsAppIcon className={cn("size-3.5", TONE_ICON_COLOR[tone])} />
          </Button>
        }
      />
      <PopoverContent align="start">
        <Chooser
          href={href}
          onChoose={(app, remember) => {
            choose(app, remember);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
