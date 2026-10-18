"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Keeps one broken piece of a screen from taking the whole screen down.
 *
 * Without this, a single render error anywhere — a card whose API answered in an unexpected
 * shape, one widget with a bad number — escapes to Next's route-level error page, and the owner
 * sees "Something went wrong" instead of the rest of a working screen. Wrapped, the broken part
 * shows a small retry card and everything around it keeps working.
 */
interface Props {
  children: ReactNode;
  /** Shown instead of the default card. */
  fallback?: ReactNode;
  /** Named in the default card and in the console line, so a report says which part failed. */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Left in production on purpose: this is the only trace of a card that failed quietly.
    console.error(`[${this.props.label || "section"}] render failed:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card p-4 text-center">
        <AlertTriangle className="size-5 text-amber-600" aria-hidden />
        <p className="text-sm font-medium">{this.props.label ? `${this.props.label} couldn't load` : "This part couldn't load"}</p>
        <p className="text-xs text-muted-foreground">The rest of the page is fine. Try again, or reload.</p>
        <Button type="button" variant="outline" className="h-10" onClick={() => this.setState({ error: null })}>
          <RotateCcw className="size-4" /> Try again
        </Button>
      </div>
    );
  }
}
