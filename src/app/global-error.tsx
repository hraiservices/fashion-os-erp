"use client";

import { useEffect } from "react";

/**
 * Catches an error thrown in the root layout itself (rare, but `error.tsx` can't catch that —
 * only errors in its own nested routes). Must render its own <html>/<body> since the root
 * layout is what failed; kept deliberately framework-free (no Button/Tailwind theme classes
 * depending on providers) so it still renders even if app-level context set-up is what broke.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ display: "flex", minHeight: "100dvh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "1.5rem", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <p style={{ fontWeight: 600 }}>Something went wrong</p>
        <p style={{ fontSize: "0.875rem", color: "#71717a", maxWidth: "24rem" }}>The app hit an unexpected error while loading. Try again.</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ height: "3rem", padding: "0 1.5rem", borderRadius: "0.5rem", background: "#18181b", color: "#fff", fontSize: "1rem", border: "none" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
