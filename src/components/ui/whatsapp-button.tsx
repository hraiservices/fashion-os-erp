import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WhatsAppButtonProps {
  href: string;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "xs" | "lg";
  className?: string;
  /** Class applied to the label <span> — e.g. "hidden lg:inline" to collapse to icon-only on narrow screens. */
  labelClassName?: string;
}

/** Icon + label WhatsApp action — the default everywhere there's room for text. */
export function WhatsAppButton({ href, label = "WhatsApp", variant = "outline", size = "default", className, labelClassName }: WhatsAppButtonProps) {
  return (
    <Button variant={variant} size={size} className={cn("gap-1.5", className)} nativeButton={false} render={<a href={href} target="_blank" rel="noopener noreferrer" />}>
      <WhatsAppIcon className="size-4 text-[#25D366]" /> <span className={labelClassName}>{label}</span>
    </Button>
  );
}

/** Icon-only variant — only for genuinely tight spaces (Kanban cards, dense table rows). Always keep an aria-label. */
export function WhatsAppIconButton({ href, label = "Send WhatsApp message", className }: { href: string; label?: string; className?: string }) {
  return (
    <Button
      variant="outline"
      size="icon-sm"
      className={cn("shrink-0", className)}
      aria-label={label}
      title={label}
      nativeButton={false}
      render={<a href={href} target="_blank" rel="noopener noreferrer" />}
    >
      <WhatsAppIcon className="size-3.5 text-[#25D366]" />
    </Button>
  );
}
