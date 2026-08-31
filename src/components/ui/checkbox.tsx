import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Drop-in replacement for a bare `<input type="checkbox">` — same props/ref/events
 * (including the `ref={(el) => el.indeterminate = ...}` pattern used for "select all"
 * checkboxes), but wrapped in a 44px touch target so it isn't a pinhead to press in a
 * dense table row on a tablet or touch laptop. These bulk-select tables already hide
 * below `sm:` in favor of a card list, so this doesn't need a separate mobile size.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <span className="inline-flex size-11 shrink-0 items-center justify-center">
      <input type="checkbox" ref={ref} className={cn("size-4 rounded accent-primary", className)} {...props} />
    </span>
  )
);
Checkbox.displayName = "Checkbox";
