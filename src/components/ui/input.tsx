import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/** True when the caller sized the input itself (h-10, sm:h-9, lg:h-12 …). */
const HAS_EXPLICIT_HEIGHT = /(^|\s)(?:(?:sm|md|lg|xl|2xl):)?h-/

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  // The default is h-11 on touch screens and h-8 from sm up — the same responsive sizing
  // SelectTrigger, Checkbox and the AlertDialog buttons carry, so a bare Input is a proper
  // touch target on a phone ("Amount received" on Record Payment, while taking cash).
  //
  // It is applied ONLY when the caller did not pass a height of its own. Written as part of the
  // base string, the `sm:h-8` half survived tailwind-merge when a caller said `h-10` (a different
  // variant is not a conflict), so on desktop every input with an explicit height quietly
  // shrank to 32px while the buttons, selects and wrappers around it stayed at 40px — Discount
  // in the invoice item table stood taller than the Qty and Rate boxes beside it, and the
  // customer search sat shorter than the New button next to it.
  const defaultHeight = className && HAS_EXPLICIT_HEIGHT.test(className) ? "" : "h-11 sm:h-8"
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        defaultHeight,
        "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
