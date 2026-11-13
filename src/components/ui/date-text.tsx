import { cn } from "@/lib/utils";

/**
 * A date that has to be easy to spot in a list. Grey text on a grey row was hard to pick out, so
 * dates get their own colour: a deeper sky blue in light mode and a lighter one in dark mode, so
 * both keep a comfortable contrast against their background. Sky rather than the primary blue,
 * and never underlined, so it does not read as a link.
 *
 * `bold` is for a date that acts as a heading (a payment-day group header); an inline date in a
 * row stays medium weight so it stands out without shouting.
 */
export function DateText({ children, bold, className }: { children: React.ReactNode; bold?: boolean; className?: string }) {
  return <span className={cn(bold ? "font-semibold" : "font-medium", "text-sky-700 dark:text-sky-400", className)}>{children}</span>;
}
