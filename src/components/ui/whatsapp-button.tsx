import type { ReactNode } from "react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** "reminder" = a payment-reminder/nudge message — icon renders light orange instead of WhatsApp
 *  green, so it reads as a different action (chasing money) at a glance from a plain WhatsApp
 *  send, everywhere in the app. */
type WhatsAppTone = "whatsapp" | "reminder";

const TONE_ICON_COLOR: Record<WhatsAppTone, string> = {
  whatsapp: "text-[#25D366]",
  reminder: "text-orange-400",
};

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
  return (
    <Button variant={variant} size={size} className={cn("gap-1.5", className)} nativeButton={false} render={<a href={href} target="_blank" rel="noopener noreferrer" />}>
      <WhatsAppIcon className={cn("size-4", TONE_ICON_COLOR[tone])} /> <span className={labelClassName}>{label}</span>
    </Button>
  );
}

/** Icon-only variant — only for genuinely tight spaces (Kanban cards, dense table rows). Always keep an aria-label. */
export function WhatsAppIconButton({ href, label = "Send WhatsApp message", className, tone = "whatsapp" }: { href: string; label?: string; className?: string; tone?: WhatsAppTone }) {
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className={cn("size-11 shrink-0 sm:size-7", className)}
      aria-label={label}
      title={label}
      nativeButton={false}
      render={<a href={href} target="_blank" rel="noopener noreferrer" />}
    >
      <WhatsAppIcon className={cn("size-3.5", TONE_ICON_COLOR[tone])} />
    </Button>
  );
}
