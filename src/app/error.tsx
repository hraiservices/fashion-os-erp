"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary — without this, an unhandled render error falls through to
 * Next.js's own overlay (a raw stack trace in dev, or a blank white screen in prod), which is
 * the single most jarring "this is a website, not an app" moment a user can hit. Named
 * `error.tsx` per the App Router convention; it catches errors thrown while rendering routes
 * nested under this file, not layout.tsx itself (that needs global-error.tsx, see nearby file).
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="font-heading text-base font-medium">Something went wrong</p>
        <p className="text-sm text-muted-foreground">
          This screen hit an unexpected error. Your data is safe — try again, or go back and retry from there.
        </p>
      </div>
      <Button onClick={() => reset()} className="h-12 px-6 text-base sm:h-9 sm:px-4 sm:text-sm">
        <RotateCcw className="size-4" /> Try again
      </Button>
    </div>
  );
}
